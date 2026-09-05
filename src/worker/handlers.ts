import { db } from "@/db/client";
import { fixtureCrawler } from "@/db/fixtures";
import { getCampaign, updateCampaignStatus } from "@/features/campaigns/actions";
import { discoverWithProviders } from "@/features/discovery/service";
import { enrichLead } from "@/features/enrichment/service";
import { scoreLead } from "@/features/scoring/service";
import { generateOutreachDraft } from "@/features/outreach/draft";
import { exportCampaignCsv } from "@/features/outreach/export";
import { createSeedUrlProvider } from "@/integrations/discovery/seed-urls";
import { createOverpassProvider } from "@/integrations/discovery/overpass";
import { createCrawler, type LeadCrawler } from "@/integrations/web/crawler";
import type { JobHandler } from "@/worker/runner";

function ids(job: Parameters<JobHandler>[0]) {
  const campaignId = String(job.payload.campaignId ?? ""); const leadId = String(job.payload.leadId ?? "");
  if (!campaignId) throw new Error("campaignId is required");
  return { campaignId, leadId };
}

function crawler(): LeadCrawler { return process.env.LEADHUNTER_FIXTURE_MODE === "true" ? fixtureCrawler : createCrawler(); }

export const jobHandlers: Partial<Record<"discover_leads" | "enrich_lead" | "score_lead" | "generate_outreach" | "send_email" | "export_campaign", JobHandler>> = {
  discover_leads: async (job) => {
    const { campaignId } = ids(job); const campaign = getCampaign(db, campaignId); if (!campaign) throw new Error("Campaign not found");
    const seedUrls = Array.isArray(job.payload.seedUrls) ? job.payload.seedUrls.map(String) : [];
    const providers = [seedUrls.length ? createSeedUrlProvider(seedUrls) : null, campaign.sources.includes("overpass") ? createOverpassProvider() : null].filter((value) => value !== null);
    const results = await discoverWithProviders(db, campaignId, { campaignId, locations: campaign.targetLocations, industries: campaign.industries, keywords: campaign.keywords, limit: campaign.targetLeadCount, seedUrls }, providers);
    return { results };
  },
  enrich_lead: async (job) => { const { leadId } = ids(job); if (!leadId) throw new Error("leadId is required"); await enrichLead(db, leadId, crawler()); return { leadId }; },
  score_lead: async (job) => { const { campaignId, leadId } = ids(job); if (!leadId) throw new Error("leadId is required"); const result = scoreLead(db, leadId, campaignId); updateCampaignStatus(db, campaignId, "ready"); return { leadId, score: result.score, confidence: result.confidence }; },
  generate_outreach: async (job) => { const { campaignId, leadId } = ids(job); if (!leadId) throw new Error("leadId is required"); const draft = generateOutreachDraft(db, leadId, campaignId, "email"); return { draftId: draft.id }; },
  export_campaign: async (job) => { const { campaignId } = ids(job); const csv = exportCampaignCsv(db, campaignId); return { rows: Math.max(0, csv.split(/\r?\n/).length - 1) }; },
};
