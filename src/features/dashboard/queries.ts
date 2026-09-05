import type { AppDatabase } from "@/db/client";

function count(database: AppDatabase, where = "1=1"): number { return (database.$client.prepare(`SELECT count(*) as count FROM leads WHERE ${where}`).get() as { count: number }).count; }

export function getDashboardMetrics(database: AppDatabase) {
  const sqlite = database.$client;
  return {
    discovered: count(database), enriched: count(database, "status IN ('enriched','scored','qualified','shortlisted','draft_ready','contacted','replied','interested','meeting','won','lost')"),
    qualified: count(database, "status IN ('qualified','shortlisted','draft_ready','contacted','replied','interested','meeting','won')"), shortlisted: count(database, "shortlisted = 1"),
    withEmail: count(database, "primary_email IS NOT NULL OR EXISTS (SELECT 1 FROM lead_contacts c WHERE c.lead_id = leads.id AND c.type = 'email')"),
    drafts: (sqlite.prepare("SELECT count(*) as count FROM outreach_drafts").get() as { count: number }).count,
    contacted: count(database, "status IN ('contacted','replied','interested','meeting','won')"), replied: count(database, "status IN ('replied','interested','meeting','won')"),
    interested: count(database, "status IN ('interested','meeting','won')"), meetings: count(database, "status IN ('meeting','won')"), won: count(database, "status = 'won'"),
    aiCost: (sqlite.prepare("SELECT COALESCE(sum(estimated_cost), 0) as total FROM ai_calls WHERE status = 'completed'").get() as { total: number }).total,
    averageScore: (sqlite.prepare("SELECT COALESCE(avg(score), 0) as average FROM lead_scores").get() as { average: number }).average,
    topSources: sqlite.prepare("SELECT provider, count(DISTINCT lead_id) as count FROM lead_sources GROUP BY provider ORDER BY count DESC LIMIT 5").all() as Array<{ provider: string; count: number }>,
    runningJobs: (sqlite.prepare("SELECT count(*) as count FROM jobs WHERE status = 'running'").get() as { count: number }).count,
    dmsSentToday: (sqlite.prepare("SELECT count(*) as count FROM messages WHERE direction = 'out' AND sent_via = 'browser' AND created_at >= ?").get(new Date(new Date().toISOString().slice(0, 10)).toISOString()) as { count: number }).count,
    dmDryRuns: (sqlite.prepare("SELECT count(*) as count FROM messages WHERE direction = 'out' AND sent_via = 'dry_run'").get() as { count: number }).count,
    inboundMessages: (sqlite.prepare("SELECT count(*) as count FROM messages WHERE direction = 'in'").get() as { count: number }).count,
    handoffs: count(database, "status IN ('whatsapp_handoff','registered','active_customer','joined_affiliate_group','active_affiliate','generated_customer')"),
    activeCustomers: count(database, "status IN ('active_customer','generated_customer','won')"),
    openExceptions: (sqlite.prepare("SELECT count(*) as count FROM exceptions WHERE resolved = 0").get() as { count: number }).count,
    recentErrors: sqlite.prepare("SELECT id, type, error, updated_at FROM jobs WHERE error IS NOT NULL ORDER BY updated_at DESC LIMIT 5").all() as Array<{ id: string; type: string; error: string; updated_at: string }>,
  };
}

export function getCampaignOperations(database: AppDatabase, campaignId: string) {
  const row = database.$client.prepare(`SELECT count(*) as found,
    sum(CASE WHEN l.status IN ('enriched','scored','qualified','shortlisted','draft_ready','contacted','replied','interested','meeting','won','lost') THEN 1 ELSE 0 END) as enriched,
    sum(CASE WHEN COALESCE((SELECT score FROM lead_scores s WHERE s.lead_id = l.id AND s.campaign_id = ? ORDER BY created_at DESC LIMIT 1), 0) >= c.minimum_score THEN 1 ELSE 0 END) as qualified,
    sum(CASE WHEN l.primary_email IS NOT NULL THEN 1 ELSE 0 END) as with_email
    FROM campaign_leads cl JOIN leads l ON l.id = cl.lead_id JOIN campaigns c ON c.id = cl.campaign_id WHERE cl.campaign_id = ?`).get(campaignId, campaignId) as { found: number; enriched: number | null; qualified: number | null; with_email: number | null };
  return { found: row.found, enriched: row.enriched ?? 0, qualified: row.qualified ?? 0, withEmail: row.with_email ?? 0 };
}
