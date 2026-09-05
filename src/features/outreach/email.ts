import type { AppDatabase } from "@/db/client";
import { isSuppressed } from "@/features/outreach/suppression";

interface EmailInput { leadId: string; campaignId: string; draftId: string; recipient: string; idempotencyKey: string }
interface EmailConfig { enabled: boolean; maxPerDay: number; minSecondsBetween: number }
type EmailSender = (message: { to: string; subject: string; text: string }) => Promise<void>;

export async function sendApprovedEmail(database: AppDatabase, input: EmailInput, config: EmailConfig, sender: EmailSender, now = new Date()) {
  const sqlite = database.$client;
  const existing = sqlite.prepare("SELECT type FROM outreach_events WHERE idempotency_key = ?").get(input.idempotencyKey) as { type: string } | undefined;
  if (existing) return { mode: existing.type === "email_sent" ? "sent" as const : "dry_run" as const, duplicate: true };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recipient)) throw new Error("Email inválido.");
  const lead = sqlite.prepare("SELECT company_name, normalized_domain, primary_phone FROM leads WHERE id = ?").get(input.leadId) as { company_name: string; normalized_domain: string | null; primary_phone: string | null } | undefined;
  const campaign = sqlite.prepare("SELECT status FROM campaigns WHERE id = ?").get(input.campaignId) as { status: string } | undefined;
  const draft = sqlite.prepare("SELECT subject, message, approved FROM outreach_drafts WHERE id = ? AND lead_id = ? AND campaign_id = ?").get(input.draftId, input.leadId, input.campaignId) as { subject: string | null; message: string; approved: number } | undefined;
  if (!lead || !campaign || !draft) throw new Error("Lead, campanha ou abordagem não encontrado.");
  if (!draft.approved) throw new Error("A abordagem precisa ser aprovada antes do envio.");
  if (!["ready", "discovering", "enriching", "scoring"].includes(campaign.status)) throw new Error("A campanha não está ativa.");
  if (isSuppressed(database, { email: input.recipient, domain: lead.normalized_domain, phone: lead.primary_phone, companyName: lead.company_name })) throw new Error("Este lead está na lista de não contato.");
  const timestamp = now.toISOString();
  if (!config.enabled) {
    sqlite.prepare("INSERT INTO outreach_events (id, lead_id, campaign_id, draft_id, type, channel, recipient, idempotency_key, metadata, created_at) VALUES (?, ?, ?, ?, 'email_dry_run', 'email', ?, ?, '{}', ?)")
      .run(crypto.randomUUID(), input.leadId, input.campaignId, input.draftId, input.recipient, input.idempotencyKey, timestamp);
    return { mode: "dry_run" as const, duplicate: false };
  }
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  const sentToday = (sqlite.prepare("SELECT count(*) as count FROM outreach_events WHERE type = 'email_sent' AND created_at >= ?").get(dayStart.toISOString()) as { count: number }).count;
  if (sentToday >= config.maxPerDay) throw new Error("Limite diário de emails atingido.");
  const last = sqlite.prepare("SELECT created_at FROM outreach_events WHERE type = 'email_sent' ORDER BY created_at DESC LIMIT 1").get() as { created_at: string } | undefined;
  if (last && now.getTime() - new Date(last.created_at).getTime() < config.minSecondsBetween * 1_000) throw new Error("Aguarde o intervalo mínimo entre emails.");
  await sender({ to: input.recipient, subject: draft.subject ?? "Contato", text: draft.message });
  sqlite.transaction(() => {
    sqlite.prepare("INSERT INTO outreach_events (id, lead_id, campaign_id, draft_id, type, channel, recipient, idempotency_key, metadata, created_at) VALUES (?, ?, ?, ?, 'email_sent', 'email', ?, ?, '{}', ?)")
      .run(crypto.randomUUID(), input.leadId, input.campaignId, input.draftId, input.recipient, input.idempotencyKey, timestamp);
    sqlite.prepare("UPDATE leads SET status = 'contacted', last_action_at = ?, updated_at = ? WHERE id = ?").run(timestamp, timestamp, input.leadId);
  })();
  return { mode: "sent" as const, duplicate: false };
}
