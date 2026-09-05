import type { AppDatabase } from "@/db/client";
import { generateOutreachDraft } from "@/features/outreach/draft";
import { suppress } from "@/features/outreach/suppression";

export const leadStatuses = ["discovered", "enriching", "enriched", "scored", "qualified", "shortlisted", "draft_ready", "contacted", "replied", "interested", "meeting", "won", "lost", "do_not_contact"] as const;
export type LeadStatus = (typeof leadStatuses)[number];

export const leadStatusLabels: Record<LeadStatus, string> = { discovered: "Descoberto", enriching: "Enriquecendo", enriched: "Enriquecido", scored: "Pontuado", qualified: "Qualificado", shortlisted: "Shortlist", draft_ready: "Abordagem pronta", contacted: "Contatado", replied: "Respondeu", interested: "Interessado", meeting: "Reunião", won: "Ganho", lost: "Perdido", do_not_contact: "Não contatar" };

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
