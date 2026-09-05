import { db } from "@/db/client";
import { fixtureCrawler } from "@/db/fixtures";
import { getCampaign, updateCampaignStatus } from "@/features/campaigns/actions";
import { runEngine } from "@/features/conversations/engine";
import { apiMaySend, recordOutbound } from "@/features/conversations/service";
import { discoverWithProviders } from "@/features/discovery/service";
import { enrichLead } from "@/features/enrichment/service";
import { applyRebalance, listExperiments } from "@/features/experiments/service";
import { autopilotPlan, markRebalanced } from "@/features/instagram/autopilot";
import { sendBrowserMessage } from "@/features/instagram/outreach";
import { recordException } from "@/features/ops/guard";
import { scoreLead } from "@/features/scoring/service";
import { generateOutreachDraft } from "@/features/outreach/draft";
import { exportCampaignCsv } from "@/features/outreach/export";
import { createFakeInstagramBrowser, demoInstagramProfiles } from "@/integrations/browser/fake";
import { createCdpInstagramBrowser, type InstagramBrowser } from "@/integrations/browser/instagram";
import { createInstagramProvider } from "@/integrations/discovery/instagram";
import { createSeedUrlProvider } from "@/integrations/discovery/seed-urls";
import { createOverpassProvider } from "@/integrations/discovery/overpass";
import { createMetaSender } from "@/integrations/instagram/api";
import { createLlmConversation } from "@/integrations/llm/conversation";
import { createCrawler, type LeadCrawler } from "@/integrations/web/crawler";
import { enqueueWhatsapp } from "@/integrations/whatsapp/queue";
import { createQueue, type JobType } from "@/worker/queue";
import type { JobHandler } from "@/worker/runner";

function ids(job: Parameters<JobHandler>[0]) {
  const campaignId = String(job.payload.campaignId ?? ""); const leadId = String(job.payload.leadId ?? "");
  if (!campaignId) throw new Error("campaignId is required");
  return { campaignId, leadId };
}

const fixtureMode = () => process.env.LEADHUNTER_FIXTURE_MODE === "true";
function crawler(): LeadCrawler { return fixtureMode() ? fixtureCrawler : createCrawler(); }
let cdpBrowser: InstagramBrowser | null = null;
// Fixture mode never touches a real browser; otherwise one CDP connection is shared by the worker process.
export function instagramBrowser(): InstagramBrowser {
  if (fixtureMode()) return createFakeInstagramBrowser({ profiles: demoInstagramProfiles, searches: { "dentist miami": ["oceandental", "brightsmile"], "dentista miami": ["oceandental", "brightsmile"] }, hashtags: { dentistamiami: ["brightsmile"], sorriso: ["sorrisocreator"] } });
  cdpBrowser ??= createCdpInstagramBrowser();
  return cdpBrowser;
}
const dmEnabled = () => process.env.INSTAGRAM_DM_ENABLED === "true";

function scorePending(campaignId: string) {
  const rows = db.$client.prepare("SELECT l.id, l.website FROM campaign_leads cl JOIN leads l ON l.id = cl.lead_id WHERE cl.campaign_id = ? AND NOT EXISTS (SELECT 1 FROM lead_scores s WHERE s.lead_id = l.id AND s.campaign_id = cl.campaign_id)").all(campaignId) as Array<{ id: string; website: string | null }>;
  const queue = createQueue(db);
  for (const row of rows) {
    scoreLead(db, row.id, campaignId);
    if (row.website) queue.enqueue({ type: "enrich_lead", payload: { campaignId, leadId: row.id }, idempotencyKey: `enrich_lead:${campaignId}:${row.id}` });
  }
  return rows.length;
}

export const jobHandlers: Partial<Record<JobType, JobHandler>> = {
  discover_leads: async (job) => {
    const { campaignId } = ids(job); const campaign = getCampaign(db, campaignId); if (!campaign) throw new Error("Campaign not found");
    const seedUrls = Array.isArray(job.payload.seedUrls) ? job.payload.seedUrls.map(String) : [];
    const providers = [seedUrls.length ? createSeedUrlProvider(seedUrls) : null, campaign.sources.includes("overpass") ? createOverpassProvider() : null].filter((value) => value !== null);
    const results = await discoverWithProviders(db, campaignId, { campaignId, locations: campaign.targetLocations, industries: campaign.industries, keywords: campaign.keywords, limit: campaign.targetLeadCount, seedUrls }, providers);
    return { results };
  },
  discover_instagram: async (job) => {
    const { campaignId } = ids(job); const campaign = getCampaign(db, campaignId); if (!campaign) throw new Error("Campaign not found");
    const results = await discoverWithProviders(db, campaignId, { campaignId, locations: campaign.targetLocations, industries: campaign.industries, keywords: campaign.keywords, hashtags: campaign.hashtags, funnel: campaign.funnel, limit: campaign.targetLeadCount }, [createInstagramProvider(instagramBrowser(), { pauseMs: fixtureMode() ? 0 : 1_500 })]);
    const failed = results.find((r) => r.error);
    if (failed?.error) recordException(db, { kind: "discovery_error", message: `${failed.provider}: ${failed.error}` });
    const scored = scorePending(campaignId);
    updateCampaignStatus(db, campaignId, "ready");
    return { results, scored };
  },
  enrich_lead: async (job) => { const { leadId } = ids(job); if (!leadId) throw new Error("leadId is required"); await enrichLead(db, leadId, crawler()); return { leadId }; },
  score_lead: async (job) => { const { campaignId, leadId } = ids(job); if (!leadId) throw new Error("leadId is required"); const result = scoreLead(db, leadId, campaignId); updateCampaignStatus(db, campaignId, "ready"); return { leadId, score: result.score, confidence: result.confidence }; },
  generate_outreach: async (job) => { const { campaignId, leadId } = ids(job); if (!leadId) throw new Error("leadId is required"); const draft = generateOutreachDraft(db, leadId, campaignId, "email"); return { draftId: draft.id }; },
  export_campaign: async (job) => { const { campaignId } = ids(job); const csv = exportCampaignCsv(db, campaignId); return { rows: Math.max(0, csv.split(/\r?\n/).length - 1) }; },

  send_instagram_dm: async (job) => {
    const leadId = String(job.payload.leadId ?? ""); if (!leadId) throw new Error("leadId is required");
    const outcome = await sendBrowserMessage(db, { leadId, kind: "first_contact", browser: dmEnabled() ? instagramBrowser() : null, enabled: dmEnabled(), jobId: job.id });
    return { ...outcome };
  },
  followup: async (job) => {
    const leadId = String(job.payload.leadId ?? ""); if (!leadId) throw new Error("leadId is required");
    const outcome = await sendBrowserMessage(db, { leadId, kind: "followup", browser: dmEnabled() ? instagramBrowser() : null, enabled: dmEnabled(), jobId: job.id });
    return { ...outcome };
  },
  process_inbound: async (job) => {
    const leadId = String(job.payload.leadId ?? ""); const text = String(job.payload.text ?? ""); const mid = String(job.payload.mid ?? job.id);
    if (!leadId) throw new Error("leadId is required");
    const llm = createLlmConversation(db, { leadId });
    const decision = await runEngine(db, { leadId, text, llm, modelLabel: process.env.LLM_MODEL ?? "llm" });
    if (decision.reply) createQueue(db).enqueue({ type: "send_api_reply", payload: { leadId, text: decision.reply, mid }, idempotencyKey: `send_api_reply:${mid}` });
    return { intent: decision.intent, action: decision.action, replied: Boolean(decision.reply) };
  },
  send_api_reply: async (job) => {
    const leadId = String(job.payload.leadId ?? ""); const text = String(job.payload.text ?? ""); if (!leadId || !text) throw new Error("leadId and text are required");
    const verdict = apiMaySend(db, leadId);
    if (!verdict.ok) {
      if (verdict.reason === "api_window_closed") { db.$client.prepare("UPDATE leads SET channel_state = 'api_window_closed' WHERE id = ?").run(leadId); recordException(db, { kind: "api_window_closed", message: "Janela de 24h da Meta fechou antes da resposta.", leadId }); }
      return { mode: "skipped", reason: verdict.reason };
    }
    const sender = createMetaSender();
    if (!sender) { recordException(db, { kind: "api_not_configured", message: "INSTAGRAM_PAGE_ACCESS_TOKEN ausente: resposta ficou na fila de exceções.", leadId }); return { mode: "skipped", reason: "api_not_configured" }; }
    const lead = db.$client.prepare("SELECT meta_user_id FROM leads WHERE id = ?").get(leadId) as { meta_user_id: string };
    const { mid } = await sender.sendText(lead.meta_user_id, text);
    recordOutbound(db, { leadId, text, via: "api", kind: "reply", externalId: mid });
    return { mode: "sent", mid };
  },
  send_whatsapp: async (job) => {
    const leadId = String(job.payload.leadId ?? ""); const numero = String(job.payload.numero ?? ""); const mensagem = String(job.payload.mensagem ?? "");
    const result = enqueueWhatsapp(process.env.WHATSAPP_QUEUE_DIR, { numero, mensagem, leadId, origem: "leadhunter" });
    if (!result) { recordException(db, { kind: "whatsapp_not_configured", message: "WHATSAPP_QUEUE_DIR ausente.", leadId }); return { mode: "skipped" }; }
    return { mode: "queued", path: result.path };
  },
  autopilot_tick: async () => {
    if (process.env.AUTOPILOT_ENABLED !== "true") return { mode: "disabled" };
    const plan = autopilotPlan(db);
    if (plan.paused) return { mode: "paused" };
    const queue = createQueue(db); const hour = Math.floor(Date.now() / 3_600_000);
    for (const campaignId of plan.discover) queue.enqueue({ type: "discover_instagram", payload: { campaignId }, idempotencyKey: `discover_instagram:${campaignId}:${hour}` });
    if (plan.firstContact) queue.enqueue({ type: "send_instagram_dm", payload: { leadId: plan.firstContact }, idempotencyKey: `send_instagram_dm:${plan.firstContact}:${Math.floor(Date.now() / 900_000)}` });
    for (const leadId of plan.followups) queue.enqueue({ type: "followup", payload: { leadId }, idempotencyKey: `followup:${leadId}` });
    if (plan.rebalance) queue.enqueue({ type: "rebalance_experiments", payload: {}, idempotencyKey: `rebalance_experiments:${Math.floor(Date.now() / 86_400_000)}` });
    return { discover: plan.discover.length, firstContact: plan.firstContact, followups: plan.followups.length, rebalance: plan.rebalance };
  },
  rebalance_experiments: async () => {
    const summary = listExperiments(db).map((experiment) => ({ id: experiment.id, variants: applyRebalance(db, experiment.id).map((m) => ({ name: m.name, weight: m.weight, sent: m.sent })) }));
    markRebalanced(db);
    return { experiments: summary };
  },
};
