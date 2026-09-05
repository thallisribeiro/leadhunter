"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { apiMaySend, recordOutbound } from "@/features/conversations/service";
import { updateLeadStatus, type LeadStatus } from "@/features/leads/bulk-actions";
import { pauseAll, recordException, resolveException, resumeAll, setSetting } from "@/features/ops/guard";
import { createMetaSender } from "@/integrations/instagram/api";
import { createQueue } from "@/worker/queue";

const paths = ["/", "/funil", "/conversas", "/settings/instagram", "/leads"];
const refresh = () => paths.forEach((p) => revalidatePath(p));

export async function pauseAllAction(form: FormData) { pauseAll(db, String(form.get("reason") || "Pausa manual pelo operador")); refresh(); }
export async function resumeAllAction() { resumeAll(db); refresh(); }
export async function resolveExceptionAction(form: FormData) { resolveException(db, String(form.get("id"))); refresh(); }

export async function moveLeadAction(form: FormData) {
  updateLeadStatus(db, String(form.get("leadId")), String(form.get("status")) as LeadStatus);
  refresh();
}

// Manual reply from the CRM: same gates as the automatic one (API owns the channel, window open).
export async function manualReplyAction(form: FormData) {
  const leadId = String(form.get("leadId")); const text = String(form.get("text") ?? "").trim();
  if (!leadId || !text) return;
  const verdict = apiMaySend(db, leadId);
  if (!verdict.ok) { recordException(db, { kind: "manual_reply_blocked", message: `Resposta manual bloqueada: ${verdict.reason}`, leadId }); refresh(); return; }
  const sender = createMetaSender();
  if (!sender) { recordException(db, { kind: "api_not_configured", message: "INSTAGRAM_PAGE_ACCESS_TOKEN ausente.", leadId }); refresh(); return; }
  const lead = db.$client.prepare("SELECT meta_user_id FROM leads WHERE id = ?").get(leadId) as { meta_user_id: string };
  const { mid } = await sender.sendText(lead.meta_user_id, text);
  recordOutbound(db, { leadId, text, via: "api", kind: "reply", externalId: mid });
  db.$client.prepare("UPDATE leads SET channel_state = 'api_active' WHERE id = ?").run(leadId);
  refresh(); revalidatePath(`/conversas/${leadId}`);
}

export async function enqueueDmAction(form: FormData) {
  const leadId = String(form.get("leadId")); const kind = String(form.get("kind") ?? "first_contact");
  createQueue(db).enqueue({ type: kind === "followup" ? "followup" : "send_instagram_dm", payload: { leadId }, idempotencyKey: `${kind}:${leadId}:${Date.now()}` });
  refresh(); revalidatePath("/jobs");
}

export async function runAutopilotNowAction() {
  createQueue(db).enqueue({ type: "autopilot_tick", payload: {}, idempotencyKey: `autopilot_tick:manual:${Date.now()}` });
  revalidatePath("/jobs"); refresh();
}

export async function saveInstagramSettingsAction(form: FormData) {
  setSetting(db, "instagram_notes", String(form.get("notes") ?? "").slice(0, 2_000));
  refresh();
}
