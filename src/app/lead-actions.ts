"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { applyBulkAction, updateLeadStatus, type LeadStatus } from "@/features/leads/bulk-actions";
import { sendApprovedEmail } from "@/features/outreach/email";
import { createSmtpSender } from "@/integrations/smtp/client";
import { createQueue, type JobType } from "@/worker/queue";
import { updateCampaignStatus, type CampaignStatus } from "@/features/campaigns/actions";

export async function bulkLeadAction(form: FormData) {
  const leadIds = form.getAll("leadIds").map(String);
  const campaignId = String(form.get("campaignId") ?? "");
  const action = String(form.get("action") ?? "");
  if (!leadIds.length || !campaignId) return;
  if (["shortlist", "generate_outreach", "suppress"].includes(action)) {
    applyBulkAction(db, { action: action as "shortlist" | "generate_outreach" | "suppress", leadIds, campaignId });
  }
  if (action === "dry_run" || action === "send_email") {
    for (const leadId of leadIds) {
      const row = db.$client.prepare(`SELECT l.primary_email, d.id AS draft_id FROM leads l LEFT JOIN outreach_drafts d ON d.id = (SELECT id FROM outreach_drafts WHERE lead_id = l.id AND campaign_id = ? AND channel = 'email' AND approved = 1 ORDER BY created_at DESC LIMIT 1) WHERE l.id = ?`).get(campaignId, leadId) as { primary_email: string | null; draft_id: string | null } | undefined;
      if (!row?.primary_email || !row.draft_id) continue;
      const enabled = action === "send_email" && process.env.EMAIL_SENDING_ENABLED === "true";
      await sendApprovedEmail(db, { leadId, campaignId, draftId: row.draft_id, recipient: row.primary_email, idempotencyKey: `${action}:${campaignId}:${leadId}:${row.draft_id}` }, { enabled, maxPerDay: Number(process.env.MAX_EMAILS_PER_DAY ?? 30), minSecondsBetween: Number(process.env.MIN_SECONDS_BETWEEN_EMAILS ?? 60) }, createSmtpSender());
    }
  }
  revalidatePath("/leads"); revalidatePath("/shortlist"); revalidatePath("/outreach");
}

export async function updateLeadStatusAction(form: FormData) {
  updateLeadStatus(db, String(form.get("leadId")), String(form.get("status")) as LeadStatus);
  revalidatePath("/leads");
}

export async function approveDraftAction(form: FormData) {
  db.$client.prepare("UPDATE outreach_drafts SET approved = 1 WHERE id = ?").run(String(form.get("draftId")));
  revalidatePath("/outreach");
}

export async function enqueueCampaignAction(form: FormData) {
  const campaignId = String(form.get("campaignId")); const operation = String(form.get("operation"));
  const typeMap: Record<string, JobType> = { enrich: "enrich_lead", score: "score_lead", outreach: "generate_outreach" };
  const type = typeMap[operation]; if (!type) return;
  const leads = db.$client.prepare("SELECT lead_id FROM campaign_leads WHERE campaign_id = ?").all(campaignId) as Array<{ lead_id: string }>;
  const queue = createQueue(db);
  for (const lead of leads) queue.enqueue({ type, payload: { campaignId, leadId: lead.lead_id }, idempotencyKey: `${type}:${campaignId}:${lead.lead_id}:${Date.now()}` });
  revalidatePath(`/campaigns/${campaignId}`); revalidatePath("/jobs");
}

export async function updateCampaignStatusAction(form: FormData) {
  const campaignId = String(form.get("campaignId"));
  updateCampaignStatus(db, campaignId, String(form.get("status")) as CampaignStatus);
  revalidatePath(`/campaigns/${campaignId}`);
}
