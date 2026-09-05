import type { AppDatabase } from "@/db/client";

export type OutreachChannel = "email" | "instagram" | "whatsapp" | "linkedin";

interface DraftRow { id: string; lead_id: string; campaign_id: string; channel: OutreachChannel; subject: string | null; message: string; personalization_hook: string; evidence_ids: string; model: string | null; approved: number; created_at: string }

function mapDraft(row: DraftRow) {
  return { id: row.id, leadId: row.lead_id, campaignId: row.campaign_id, channel: row.channel, subject: row.subject, message: row.message, personalizationHook: row.personalization_hook, evidenceIds: JSON.parse(row.evidence_ids) as string[], model: row.model, approved: Boolean(row.approved), createdAt: row.created_at };
}

export function generateOutreachDraft(database: AppDatabase, leadId: string, campaignId: string, channel: OutreachChannel) {
  const sqlite = database.$client;
  const lead = sqlite.prepare("SELECT company_name FROM leads WHERE id = ?").get(leadId) as { company_name: string } | undefined;
  const profile = sqlite.prepare("SELECT one_line_pitch, verified_claims, call_to_action FROM business_profiles LIMIT 1").get() as { one_line_pitch: string; verified_claims: string; call_to_action: string } | undefined;
  if (!lead || !profile) throw new Error("Lead or business profile not found");
  const evidence = sqlite.prepare("SELECT id, value FROM lead_evidence WHERE lead_id = ? ORDER BY captured_at DESC LIMIT 3").all(leadId) as Array<{ id: string; value: string }>;
  if (evidence.length === 0) throw new Error("Uma abordagem personalizada exige evidência do lead.");
  const verifiedClaims = JSON.parse(profile.verified_claims) as string[];
  const hook = evidence[0]!.value;
  const verified = verifiedClaims[0] ? `Sobre nós: ${verifiedClaims[0]}.` : profile.one_line_pitch;
  const message = `Olá, equipe da ${lead.company_name}. Vi no material público de vocês: ${hook}. ${verified} ${profile.call_to_action}`;
  const subject = channel === "email" ? `Uma ideia para a ${lead.company_name}` : null;
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  sqlite.prepare("INSERT INTO outreach_drafts (id, lead_id, campaign_id, channel, subject, message, personalization_hook, evidence_ids, model, approved, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)")
    .run(id, leadId, campaignId, channel, subject, message, hook, JSON.stringify(evidence.map((item) => item.id)), now);
  return mapDraft(sqlite.prepare("SELECT * FROM outreach_drafts WHERE id = ?").get(id) as DraftRow);
}

export function listOutreachDrafts(database: AppDatabase) {
  return (database.$client.prepare("SELECT * FROM outreach_drafts ORDER BY created_at DESC").all() as DraftRow[]).map(mapDraft);
}
