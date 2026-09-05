import type { AppDatabase } from "@/db/client";
import { calculateLeadScore } from "@/features/scoring/score";

interface LeadRow { id: string; industry: string | null; city: string | null; region: string | null; country: string | null; website: string | null; primary_email: string | null; primary_phone: string | null; description: string | null; opportunity: string | null }
interface CampaignRow { industries: string; target_locations: string; keywords: string; preferred_signals: string; excluded_signals: string; minimum_score: number }

function includesAny(value: string, candidates: string[]): boolean {
  const normalized = value.toLocaleLowerCase("pt-BR");
  return candidates.some((candidate) => normalized.includes(candidate.toLocaleLowerCase("pt-BR")));
}

export function scoreLead(database: AppDatabase, leadId: string, campaignId: string) {
  const sqlite = database.$client;
  const lead = sqlite.prepare("SELECT * FROM leads WHERE id = ?").get(leadId) as LeadRow | undefined;
  const campaign = sqlite.prepare("SELECT * FROM campaigns WHERE id = ?").get(campaignId) as CampaignRow | undefined;
  if (!lead || !campaign) throw new Error("Lead or campaign not found");
  const evidence = sqlite.prepare("SELECT type, value FROM lead_evidence WHERE lead_id = ?").all(leadId) as Array<{ type: string; value: string }>;
  const contactTypes = (sqlite.prepare("SELECT DISTINCT type FROM lead_contacts WHERE lead_id = ?").all(leadId) as Array<{ type: string }>).map((row) => row.type);
  const sourceCount = (sqlite.prepare("SELECT count(*) as count FROM lead_sources WHERE lead_id = ?").get(leadId) as { count: number }).count;
  const industries = JSON.parse(campaign.industries) as string[];
  const locations = JSON.parse(campaign.target_locations) as string[];
  const keywords = JSON.parse(campaign.keywords) as string[];
  const preferredSignals = JSON.parse(campaign.preferred_signals) as string[];
  const excludedSignals = JSON.parse(campaign.excluded_signals) as string[];
  const searchable = [lead.industry, lead.description, ...evidence.map((item) => item.value)].filter(Boolean).join(" ");
  const location = [lead.city, lead.region, lead.country].filter(Boolean).join(" ");
  const positiveSignalCount = preferredSignals.filter((signal) => includesAny(searchable, [signal])).length;
  const result = calculateLeadScore({
    industryMatch: includesAny(searchable, industries), locationMatch: includesAny(location, locations.flatMap((item) => item.split(",").map((part) => part.trim()).filter(Boolean))),
    requiredKeywordMatch: keywords.length === 0 || includesAny(searchable, keywords), opportunityDetected: Boolean(lead.opportunity && !lead.opportunity.startsWith("Evidência insuficiente")),
    hasEmail: Boolean(lead.primary_email || contactTypes.includes("email")), hasPhone: Boolean(lead.primary_phone || contactTypes.includes("phone")), hasSocial: contactTypes.some((type) => ["instagram", "linkedin", "facebook", "whatsapp"].includes(type)),
    positiveSignalCount, exclusionDetected: includesAny(searchable, excludedSignals), hasWebsite: Boolean(lead.website), evidenceCount: evidence.length, sourceCount,
  });
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  const whyThisLead = result.breakdown.flatMap((item) => item.reasons.filter((reason) => !/não|sem|ainda/i.test(reason))).slice(0, 3).join(" · ") || "Evidência insuficiente para qualificação.";
  sqlite.transaction(() => {
    sqlite.prepare("INSERT INTO lead_scores (id, lead_id, campaign_id, score, confidence, breakdown, why_this_lead, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, leadId, campaignId, result.score, result.confidence, JSON.stringify(result.breakdown), whyThisLead, now);
    const status = result.score >= campaign.minimum_score ? "qualified" : "scored";
    sqlite.prepare("UPDATE leads SET status = ?, updated_at = ? WHERE id = ?").run(status, now, leadId);
  })();
  return { ...result, id, whyThisLead };
}
