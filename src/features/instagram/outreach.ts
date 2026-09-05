// First contact and follow-up over the browser. Every send passes the same gates in the same order:
// global pause → channel lock → suppression → pacing → claims guard → (dry-run | browser) → record.
import type { AppDatabase } from "@/db/client";
import { getBusinessProfile } from "@/features/business/actions";
import { browserMaySend, outboundStats, recordOutbound } from "@/features/conversations/service";
import { violatesClaims } from "@/features/conversations/engine";
import { assignVariant, ensureDefaultExperiments, renderTemplate } from "@/features/experiments/service";
import { canSendNow, localDay, localMinutes, pacingConfigFromEnv, typingDelayMs, type PacingConfig } from "@/features/instagram/pacing";
import { isPaused, pauseAll, recordBrowserFailure, recordBrowserSuccess } from "@/features/ops/guard";
import { InstagramRestrictionError, type InstagramBrowser } from "@/integrations/browser/instagram";

interface LeadRow { id: string; company_name: string; funnel: "customer" | "affiliate"; instagram_handle: string | null; profile: string | null; decision_role: string | null }
interface Profile { name?: string; bio?: string; followers?: number | null; externalUrl?: string | null }

function greeting(now: Date, timezone: string): string {
  const minutes = localMinutes(now, timezone);
  return minutes < 12 * 60 ? "Bom dia" : minutes < 18 * 60 ? "Boa tarde" : "Boa noite";
}

// The hook must come from something visible on the profile; never invented.
export function profileHook(database: AppDatabase, leadId: string, profile: Profile): { hook: string; evidenceIds: string[] } {
  const signals = database.$client.prepare("SELECT id, value FROM lead_evidence WHERE lead_id = ? AND type = 'signal' AND source_provider = 'instagram' ORDER BY captured_at ASC").all(leadId) as Array<{ id: string; value: string }>;
  const bio = database.$client.prepare("SELECT id, value FROM lead_evidence WHERE lead_id = ? AND type = 'instagram_bio' LIMIT 1").get(leadId) as { id: string; value: string } | undefined;
  const map: Record<string, string> = { "vende pelo Instagram": "que vocês atendem pedidos pelo direct", "WhatsApp na bio": "o WhatsApp na bio", "site no perfil": "o site no perfil", "audiência acima de 1 mil": "o alcance que vocês já têm por aqui" };
  const signal = signals.find((s) => map[s.value]);
  if (signal) return { hook: map[signal.value]!, evidenceIds: [signal.id] };
  const sentence = (bio?.value ?? profile.bio ?? "").split(/[.!\n]/)[0]?.trim();
  if (bio && sentence) return { hook: `"${sentence.slice(0, 80)}" na bio`, evidenceIds: [bio.id] };
  return { hook: "o perfil de vocês", evidenceIds: [] };
}

export function openingMessage(database: AppDatabase, input: { leadId: string; now?: Date; rng?: () => number }): { text: string; variantId: string; evidenceIds: string[] } {
  const business = getBusinessProfile(database); if (!business) throw new Error("Business profile not configured");
  const lead = database.$client.prepare("SELECT id, company_name, funnel, instagram_handle, profile, decision_role FROM leads WHERE id = ?").get(input.leadId) as LeadRow | undefined;
  if (!lead) throw new Error("Lead not found");
  const profile = (lead.profile ? JSON.parse(lead.profile) : {}) as Profile;
  const experiments = ensureDefaultExperiments(database);
  const variant = assignVariant(database, { leadId: lead.id, experimentId: experiments[lead.funnel], rng: input.rng });
  const { hook, evidenceIds } = profileHook(database, lead.id, profile);
  const timezone = process.env.OPERATING_TIMEZONE ?? process.env.APP_TIMEZONE ?? "America/Bahia";
  const shortName = (profile.name ?? lead.company_name).split(/\s+/).slice(0, 2).join(" ");
  const text = renderTemplate(variant.template, {
    saudacao: greeting(input.now ?? new Date(), timezone), nome: lead.decision_role === "owner" ? shortName : "", empresa: profile.name ?? lead.company_name, gancho: hook,
    pitch: business.oneLinePitch, owner: business.ownerName ?? business.businessName, negocio: business.businessName, tema: business.affiliateTopics[0] ?? business.targetIndustries[0] ?? "o seu tema",
  });
  if (violatesClaims(text, [...business.forbiddenClaims, ...business.unverifiedClaims])) throw new Error("A mensagem de abertura contém uma afirmação proibida.");
  return { text, variantId: variant.id, evidenceIds };
}

export const FOLLOWUP_TEXT = "Oi de novo! Só para não te deixar sem resposta: faz sentido eu te mandar em duas linhas como funciona? Se não for o momento, sem problema.";

export type SendOutcome = { mode: "sent" | "dry_run"; text: string } | { mode: "skipped"; reason: string; waitMs?: number };

function pacing(database: AppDatabase, now: Date): { config: PacingConfig; sentToday: number; lastSentAt: string | null } {
  const timezone = process.env.OPERATING_TIMEZONE ?? process.env.APP_TIMEZONE ?? "America/Bahia";
  const day = localDay(now, timezone);
  const stats = outboundStats(database, new Date(`${day}T00:00:00.000Z`).toISOString());
  return { config: pacingConfigFromEnv(process.env, stats.firstSentAt), sentToday: stats.sentToday, lastSentAt: stats.lastSentAt };
}

export async function sendBrowserMessage(database: AppDatabase, input: { leadId: string; kind: "first_contact" | "followup"; browser: InstagramBrowser | null; enabled: boolean; now?: Date; rng?: () => number; jobId?: string }): Promise<SendOutcome> {
  const now = input.now ?? new Date();
  const paused = isPaused(database); if (paused.paused) return { mode: "skipped", reason: `paused: ${paused.reason ?? ""}` };
  const verdict = browserMaySend(database, input.leadId, input.kind, now); if (!verdict.ok) return { mode: "skipped", reason: verdict.reason };
  const lead = database.$client.prepare("SELECT instagram_handle FROM leads WHERE id = ?").get(input.leadId) as { instagram_handle: string };
  if (input.enabled) {
    const { config, sentToday, lastSentAt } = pacing(database, now);
    const pace = canSendNow({ now, sentToday, lastSentAt, config, rng: input.rng });
    if (!pace.ok) return { mode: "skipped", reason: pace.reason, waitMs: pace.waitMs };
  }
  const opening = input.kind === "first_contact" ? openingMessage(database, { leadId: input.leadId, now, rng: input.rng }) : { text: FOLLOWUP_TEXT, variantId: null, evidenceIds: [] };
  if (!input.enabled) {
    recordOutbound(database, { leadId: input.leadId, text: opening.text, via: "dry_run", kind: input.kind, variantId: opening.variantId }, now);
    return { mode: "dry_run", text: opening.text };
  }
  if (!input.browser) return { mode: "skipped", reason: "browser_unavailable" };
  try {
    const result = await input.browser.sendDirectMessage(lead.instagram_handle, opening.text, { dryRun: false, typingDelayMs: typingDelayMs(input.rng), jobId: input.jobId });
    if (!result.sent) throw new Error("O navegador não confirmou o envio.");
    recordOutbound(database, { leadId: input.leadId, text: opening.text, via: "browser", kind: input.kind, variantId: opening.variantId }, now);
    recordBrowserSuccess(database);
    return { mode: "sent", text: opening.text };
  } catch (error) {
    if (error instanceof InstagramRestrictionError) { pauseAll(database, error.message, input.leadId); throw error; }
    recordBrowserFailure(database, error instanceof Error ? error.message : String(error), input.leadId);
    throw error;
  }
}
