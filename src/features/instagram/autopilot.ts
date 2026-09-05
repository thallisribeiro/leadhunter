// Observe → decide → act → measure → learn → adapt, one tick at a time. The tick only decides what to
// enqueue; every job re-checks its own gates when it runs, so a stale plan can never send twice.
import type { AppDatabase } from "@/db/client";
import { isPaused, getSetting, setSetting } from "@/features/ops/guard";

export interface AutopilotPlan { discover: string[]; firstContact: string | null; followups: string[]; rebalance: boolean; paused: boolean }

export function autopilotPlan(database: AppDatabase, now = new Date()): AutopilotPlan {
  const sqlite = database.$client;
  if (isPaused(database).paused) return { discover: [], firstContact: null, followups: [], rebalance: false, paused: true };
  const discover = (sqlite.prepare(`SELECT c.id FROM campaigns c WHERE c.autopilot = 1 AND c.status NOT IN ('paused','completed','failed') AND c.sources LIKE '%instagram%'
    AND (SELECT count(*) FROM campaign_leads cl WHERE cl.campaign_id = c.id) < c.target_lead_count`).all() as Array<{ id: string }>).map((r) => r.id);
  // Highest score first among qualified leads that never got a browser message and are not suppressed by status.
  const candidate = sqlite.prepare(`SELECT l.id FROM leads l
    WHERE l.instagram_handle IS NOT NULL AND l.status IN ('qualified','shortlisted','draft_ready')
      AND EXISTS (SELECT 1 FROM campaign_leads cl JOIN campaigns c ON c.id = cl.campaign_id WHERE cl.lead_id = l.id AND c.autopilot = 1 AND c.status NOT IN ('paused','completed','failed'))
      AND NOT EXISTS (SELECT 1 FROM conversations cv WHERE cv.lead_id = l.id AND cv.state <> 'browser_contact_pending')
      AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.lead_id = l.id AND m.direction = 'out' AND m.sent_via = 'browser')
    ORDER BY COALESCE((SELECT score FROM lead_scores s WHERE s.lead_id = l.id ORDER BY created_at DESC LIMIT 1), 0) DESC, l.created_at ASC LIMIT 1`).get() as { id: string } | undefined;
  const cutoff = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  const followups = (sqlite.prepare(`SELECT cv.lead_id FROM conversations cv JOIN leads l ON l.id = cv.lead_id
    WHERE cv.owner = 'browser' AND cv.state = 'waiting_inbound_reply' AND cv.followups_sent = 0 AND cv.last_outbound_at < ? AND l.status = 'contacted' ORDER BY cv.last_outbound_at ASC LIMIT 3`).all(cutoff) as Array<{ lead_id: string }>).map((r) => r.lead_id);
  const last = getSetting(database, "last_rebalance_at");
  const rebalance = !last || now.getTime() - new Date(last).getTime() > 86_400_000;
  return { discover, firstContact: candidate?.id ?? null, followups, rebalance, paused: false };
}

export function markRebalanced(database: AppDatabase, now = new Date()): void { setSetting(database, "last_rebalance_at", now.toISOString()); }

// Idempotency key for the periodic tick: one job per 5-minute window.
export function tickKey(now = new Date()): string { return `autopilot_tick:${Math.floor(now.getTime() / 300_000)}`; }
