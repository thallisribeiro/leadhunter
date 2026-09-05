// One conversation per lead. The channel has exactly one owner at a time: the browser until the lead
// replies, the official API afterwards. This module is the lock that keeps browser and API from both sending.
import type { AppDatabase } from "@/db/client";
import { updateLeadStatus, type LeadStatus } from "@/features/leads/bulk-actions";
import { isSuppressed, suppress } from "@/features/outreach/suppression";
import { messagingWindowOpen } from "@/integrations/instagram/api";

export interface ConversationRow { id: string; lead_id: string; channel: string; owner: "browser" | "api"; state: string; meta_user_id: string | null; last_inbound_at: string | null; last_outbound_at: string | null; followups_sent: number; created_at: string; updated_at: string }
export interface MessageRow { id: string; conversation_id: string; lead_id: string; direction: "in" | "out"; channel: string; sent_via: string | null; text: string; variant_id: string | null; external_id: string | null; intent: string | null; created_at: string }
interface LeadRow { id: string; company_name: string; status: string; funnel: string; instagram_handle: string | null; normalized_domain: string | null; primary_email: string | null; primary_phone: string | null; channel_state: string; meta_user_id: string | null }

const REPLIED_OR_LATER = new Set(["replied", "interested", "meeting", "whatsapp_handoff", "registered", "active_customer", "joined_affiliate_group", "active_affiliate", "generated_customer", "won"]);

function lead(database: AppDatabase, leadId: string): LeadRow | undefined {
  return database.$client.prepare("SELECT id, company_name, status, funnel, instagram_handle, normalized_domain, primary_email, primary_phone, channel_state, meta_user_id FROM leads WHERE id = ?").get(leadId) as LeadRow | undefined;
}

export function getConversation(database: AppDatabase, leadId: string): ConversationRow | null {
  return (database.$client.prepare("SELECT * FROM conversations WHERE lead_id = ?").get(leadId) as ConversationRow | undefined) ?? null;
}

export function ensureConversation(database: AppDatabase, leadId: string): ConversationRow {
  const existing = getConversation(database, leadId); if (existing) return existing;
  const now = new Date().toISOString();
  database.$client.prepare("INSERT INTO conversations (id, lead_id, channel, owner, state, created_at, updated_at) VALUES (?, ?, 'instagram', 'browser', 'browser_contact_pending', ?, ?)").run(crypto.randomUUID(), leadId, now, now);
  return getConversation(database, leadId)!;
}

function setChannelState(database: AppDatabase, leadId: string, conversation: Partial<Pick<ConversationRow, "owner" | "state" | "meta_user_id" | "last_inbound_at" | "last_outbound_at" | "followups_sent">>, now: string) {
  const sets = Object.entries(conversation).filter(([, v]) => v !== undefined);
  if (sets.length) database.$client.prepare(`UPDATE conversations SET ${sets.map(([k]) => `${k} = ?`).join(", ")}, updated_at = ? WHERE lead_id = ?`).run(...sets.map(([, v]) => v as string | number | null), now, leadId);
  if (conversation.state) database.$client.prepare("UPDATE leads SET channel_state = ?, updated_at = ? WHERE id = ?").run(conversation.state, now, leadId);
}

export function leadIsSuppressed(database: AppDatabase, row: LeadRow): boolean {
  return isSuppressed(database, { email: row.primary_email, domain: row.normalized_domain, phone: row.primary_phone, companyName: row.company_name })
    || (row.instagram_handle ? Boolean(database.$client.prepare("SELECT 1 FROM suppressions WHERE type = 'instagram' AND normalized_value = ?").get(row.instagram_handle.toLowerCase())) : false);
}

export type SendVerdict = { ok: true } | { ok: false; reason: string };

// First contact and (one) follow-up go through the browser only while the browser owns the channel.
export function browserMaySend(database: AppDatabase, leadId: string, kind: "first_contact" | "followup" = "first_contact", now = new Date()): SendVerdict {
  const row = lead(database, leadId); if (!row) return { ok: false, reason: "lead_not_found" };
  if (!row.instagram_handle) return { ok: false, reason: "no_instagram_handle" };
  if (["do_not_contact", "lost", "closed"].includes(row.status)) return { ok: false, reason: `status_${row.status}` };
  if (leadIsSuppressed(database, row)) return { ok: false, reason: "suppressed" };
  const conversation = ensureConversation(database, leadId);
  if (conversation.owner !== "browser") return { ok: false, reason: "channel_owned_by_api" };
  if (kind === "first_contact") return conversation.state === "browser_contact_pending" ? { ok: true } : { ok: false, reason: "already_contacted" };
  if (conversation.state !== "waiting_inbound_reply") return { ok: false, reason: "not_waiting_reply" };
  if (conversation.followups_sent >= 1) return { ok: false, reason: "followup_limit" };
  if (conversation.last_outbound_at && now.getTime() - new Date(conversation.last_outbound_at).getTime() < 3 * 86_400_000) return { ok: false, reason: "too_early_for_followup" };
  return { ok: true };
}

export function apiMaySend(database: AppDatabase, leadId: string, now = new Date()): SendVerdict {
  const row = lead(database, leadId); if (!row) return { ok: false, reason: "lead_not_found" };
  if (["do_not_contact", "lost", "closed"].includes(row.status)) return { ok: false, reason: `status_${row.status}` };
  if (leadIsSuppressed(database, row)) return { ok: false, reason: "suppressed" };
  const conversation = getConversation(database, leadId); if (!conversation) return { ok: false, reason: "no_conversation" };
  if (conversation.owner !== "api") return { ok: false, reason: "channel_owned_by_browser" };
  if (!conversation.meta_user_id) return { ok: false, reason: "no_meta_user_id" };
  if (!messagingWindowOpen(conversation.last_inbound_at, now)) return { ok: false, reason: "api_window_closed" };
  return { ok: true };
}

export function recordOutbound(database: AppDatabase, input: { leadId: string; text: string; via: "browser" | "api" | "dry_run"; kind: "first_contact" | "followup" | "reply"; variantId?: string | null; externalId?: string | null }, now = new Date()): MessageRow {
  const conversation = ensureConversation(database, input.leadId);
  const timestamp = now.toISOString(); const id = crypto.randomUUID();
  database.$client.prepare("INSERT INTO messages (id, conversation_id, lead_id, direction, channel, sent_via, text, variant_id, external_id, created_at) VALUES (?, ?, ?, 'out', 'instagram', ?, ?, ?, ?, ?)")
    .run(id, conversation.id, input.leadId, input.via, input.text, input.variantId ?? null, input.externalId ?? null, timestamp);
  if (input.via !== "dry_run") {
    if (input.kind === "reply") setChannelState(database, input.leadId, { last_outbound_at: timestamp, state: "api_active" }, timestamp);
    else setChannelState(database, input.leadId, { last_outbound_at: timestamp, state: "waiting_inbound_reply", followups_sent: input.kind === "followup" ? conversation.followups_sent + 1 : conversation.followups_sent }, timestamp);
    const row = lead(database, input.leadId)!;
    if (input.kind !== "reply" && !REPLIED_OR_LATER.has(row.status)) updateLeadStatus(database, input.leadId, "contacted");
  }
  return database.$client.prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow;
}

export function findLeadByMetaUser(database: AppDatabase, metaUserId: string): string | null {
  return (database.$client.prepare("SELECT id FROM leads WHERE meta_user_id = ?").get(metaUserId) as { id: string } | undefined)?.id ?? null;
}

export function findLeadByHandle(database: AppDatabase, handle: string): string | null {
  return (database.$client.prepare("SELECT id FROM leads WHERE instagram_handle = ?").get(handle.toLowerCase()) as { id: string } | undefined)?.id ?? null;
}

export function linkMetaUser(database: AppDatabase, leadId: string, metaUserId: string): void {
  const now = new Date().toISOString();
  database.$client.prepare("UPDATE leads SET meta_user_id = ?, updated_at = ? WHERE id = ?").run(metaUserId, now, leadId);
  ensureConversation(database, leadId);
  database.$client.prepare("UPDATE conversations SET meta_user_id = ?, updated_at = ? WHERE lead_id = ?").run(metaUserId, now, leadId);
}

export type InboundResult = { duplicate: true } | { duplicate: false; matched: false } | { duplicate: false; matched: true; leadId: string; message: MessageRow };

// Inbound via webhook: idempotent by Meta message id; the first reply hands the channel to the API.
export function recordInbound(database: AppDatabase, input: { metaUserId: string; mid: string; text: string; at: string; leadId?: string | null }): InboundResult {
  if (database.$client.prepare("SELECT 1 FROM messages WHERE external_id = ?").get(input.mid)) return { duplicate: true };
  const leadId = input.leadId ?? findLeadByMetaUser(database, input.metaUserId);
  if (!leadId) return { duplicate: false, matched: false };
  const conversation = ensureConversation(database, leadId);
  const id = crypto.randomUUID();
  database.$client.transaction(() => {
    database.$client.prepare("INSERT INTO messages (id, conversation_id, lead_id, direction, channel, sent_via, text, external_id, created_at) VALUES (?, ?, ?, 'in', 'instagram', 'api', ?, ?, ?)").run(id, conversation.id, leadId, input.text, input.mid, input.at);
    linkMetaUser(database, leadId, input.metaUserId);
    setChannelState(database, leadId, { owner: "api", state: "api_active", last_inbound_at: input.at }, input.at);
    const row = lead(database, leadId)!;
    if (!REPLIED_OR_LATER.has(row.status) && !["do_not_contact", "lost", "closed"].includes(row.status)) updateLeadStatus(database, leadId, "replied");
  })();
  return { duplicate: false, matched: true, leadId, message: database.$client.prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow };
}

export function markDoNotContact(database: AppDatabase, leadId: string, reason: string): void {
  const row = lead(database, leadId); if (!row) return;
  suppress(database, { type: "company", value: row.company_name, reason });
  if (row.instagram_handle) suppress(database, { type: "instagram", value: row.instagram_handle, reason });
  if (row.primary_email) suppress(database, { type: "email", value: row.primary_email, reason });
  if (row.primary_phone) suppress(database, { type: "phone", value: row.primary_phone, reason });
  updateLeadStatus(database, leadId, "do_not_contact");
  ensureConversation(database, leadId);
  setChannelState(database, leadId, { state: "do_not_contact" }, new Date().toISOString());
}

export function setLeadStage(database: AppDatabase, leadId: string, status: LeadStatus): void { updateLeadStatus(database, leadId, status); }

export function timeline(database: AppDatabase, leadId: string) {
  const messages = database.$client.prepare("SELECT * FROM messages WHERE lead_id = ? ORDER BY created_at ASC").all(leadId) as MessageRow[];
  const decisions = database.$client.prepare("SELECT id, intent, action, reply, reasoning, model, created_at FROM ai_decisions WHERE lead_id = ? ORDER BY created_at ASC").all(leadId) as Array<{ id: string; intent: string; action: string; reply: string | null; reasoning: string; model: string | null; created_at: string }>;
  return { conversation: getConversation(database, leadId), messages, decisions };
}

export function listConversations(database: AppDatabase, filters: { owner?: "browser" | "api"; state?: string } = {}) {
  const where: string[] = []; const args: string[] = [];
  if (filters.owner) { where.push("c.owner = ?"); args.push(filters.owner); }
  if (filters.state) { where.push("c.state = ?"); args.push(filters.state); }
  return database.$client.prepare(`SELECT c.*, l.company_name, l.instagram_handle, l.status AS lead_status, l.funnel,
    (SELECT text FROM messages m WHERE m.conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_text,
    (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
    FROM conversations c JOIN leads l ON l.id = c.lead_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY COALESCE(c.last_inbound_at, c.last_outbound_at, c.created_at) DESC LIMIT 200`).all(...args) as Array<ConversationRow & { company_name: string; instagram_handle: string | null; lead_status: string; funnel: string; last_text: string | null; message_count: number }>;
}

// Operational counters for pacing and the dashboard.
export function outboundStats(database: AppDatabase, dayStartIso: string) {
  const sqlite = database.$client;
  const sentToday = (sqlite.prepare("SELECT count(*) AS n FROM messages WHERE direction = 'out' AND sent_via = 'browser' AND created_at >= ?").get(dayStartIso) as { n: number }).n;
  const lastSentAt = (sqlite.prepare("SELECT created_at FROM messages WHERE direction = 'out' AND sent_via = 'browser' ORDER BY created_at DESC LIMIT 1").get() as { created_at: string } | undefined)?.created_at ?? null;
  const firstSentAt = (sqlite.prepare("SELECT created_at FROM messages WHERE direction = 'out' AND sent_via = 'browser' ORDER BY created_at ASC LIMIT 1").get() as { created_at: string } | undefined)?.created_at ?? null;
  return { sentToday, lastSentAt, firstSentAt };
}
