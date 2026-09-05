import type { AppDatabase } from "@/db/client";
import { generateOutreachDraft } from "@/features/outreach/draft";
import { suppress } from "@/features/outreach/suppression";

export const leadStatuses = ["discovered", "enriching", "enriched", "scored", "qualified", "shortlisted", "draft_ready", "contacted", "replied", "interested", "meeting", "whatsapp_handoff", "registered", "active_customer", "joined_affiliate_group", "active_affiliate", "generated_customer", "won", "lost", "closed", "do_not_contact"] as const;
export type LeadStatus = (typeof leadStatuses)[number];

export const leadStatusLabels: Record<LeadStatus, string> = { discovered: "Descoberto", enriching: "Enriquecendo", enriched: "Enriquecido", scored: "Pontuado", qualified: "Qualificado", shortlisted: "Shortlist", draft_ready: "Abordagem pronta", contacted: "Abordado", replied: "Respondeu", interested: "Interessado", meeting: "Reunião", whatsapp_handoff: "Encaminhado ao WhatsApp", registered: "Cadastrado", active_customer: "Cliente ativo", joined_affiliate_group: "Entrou no grupo", active_affiliate: "Afiliado ativo", generated_customer: "Gerou cliente", won: "Ganho", lost: "Perdido", closed: "Encerrado", do_not_contact: "Não contatar" };

// Kanban columns per funnel, in the order of the original prompt.
export const customerPipeline: LeadStatus[] = ["discovered", "qualified", "contacted", "replied", "interested", "whatsapp_handoff", "registered", "active_customer", "closed"];
export const affiliatePipeline: LeadStatus[] = ["discovered", "qualified", "contacted", "replied", "interested", "joined_affiliate_group", "active_affiliate", "generated_customer", "closed"];

export const channelStateLabels: Record<string, string> = { browser_contact_pending: "Aguardando 1º contato", browser_contact_sent: "1ª DM enviada", waiting_inbound_reply: "Aguardando resposta", api_eligible: "API elegível", api_active: "Conversa pela API", api_window_closed: "Janela da API fechada", human_review_required: "Revisão humana", do_not_contact: "Não contatar", blocked: "Bloqueado", completed: "Concluído" };

export function updateLeadStatus(database: AppDatabase, leadId: string, status: LeadStatus): void {
  if (!leadStatuses.includes(status)) throw new Error("Invalid lead status");
  const now = new Date().toISOString();
  const result = database.$client.prepare("UPDATE leads SET status = ?, shortlisted = CASE WHEN ? = 'shortlisted' THEN 1 ELSE shortlisted END, last_action_at = ?, updated_at = ? WHERE id = ?").run(status, status, now, now, leadId);
  if (result.changes !== 1) throw new Error("Lead not found");
}

export function applyBulkAction(database: AppDatabase, input: { action: "shortlist" | "generate_outreach" | "suppress"; leadIds: string[]; campaignId: string }) {
  let processed = 0; let failed = 0;
  database.$client.transaction(() => {
    for (const leadId of [...new Set(input.leadIds)]) {
      try {
        if (input.action === "shortlist") updateLeadStatus(database, leadId, "shortlisted");
        if (input.action === "generate_outreach") { generateOutreachDraft(database, leadId, input.campaignId, "email"); updateLeadStatus(database, leadId, "draft_ready"); }
        if (input.action === "suppress") {
          const lead = database.$client.prepare("SELECT company_name FROM leads WHERE id = ?").get(leadId) as { company_name: string } | undefined;
          if (!lead) throw new Error("Lead not found"); suppress(database, { type: "company", value: lead.company_name, reason: "Marcado pelo operador" }); updateLeadStatus(database, leadId, "do_not_contact");
        }
        processed += 1;
      } catch { failed += 1; }
    }
  })();
  return { processed, failed };
}
