import type { AppDatabase } from "@/db/client";

export interface LeadFilters { campaignId?: string; minimumScore?: number; minimumConfidence?: number; location?: string; industry?: string; hasEmail?: boolean; hasPhone?: boolean; hasInstagram?: boolean; hasWebsite?: boolean; source?: string; status?: string; signal?: string; search?: string; shortlisted?: boolean }
export interface LeadSort { field: "score" | "confidence" | "date" | "name"; direction: "asc" | "desc" }

interface LeadListRow { id: string; company_name: string; industry: string | null; city: string | null; region: string | null; country: string | null; opportunity: string | null; primary_email: string | null; primary_phone: string | null; website: string | null; status: string; shortlisted: number; created_at: string; last_action_at: string | null; score: number | null; confidence: number | null; sources: string | null; instagram: string | null }

export function listLeads(database: AppDatabase, filters: LeadFilters = {}, sort: LeadSort = { field: "score", direction: "desc" }, page = 1, pageSize = 50) {
  const where: string[] = []; const args: Array<string | number> = [];
  if (filters.campaignId) { where.push("EXISTS (SELECT 1 FROM campaign_leads cfl WHERE cfl.lead_id = l.id AND cfl.campaign_id = ?)"); args.push(filters.campaignId); }
  if (filters.minimumScore != null) { where.push("COALESCE(ls.score, 0) >= ?"); args.push(filters.minimumScore); }
  if (filters.minimumConfidence != null) { where.push("COALESCE(ls.confidence, 0) >= ?"); args.push(filters.minimumConfidence); }
  if (filters.location) { where.push("lower(COALESCE(l.city, '') || ' ' || COALESCE(l.region, '') || ' ' || COALESCE(l.country, '')) LIKE ?"); args.push(`%${filters.location.toLowerCase()}%`); }
  if (filters.industry) { where.push("lower(COALESCE(l.industry, '')) LIKE ?"); args.push(`%${filters.industry.toLowerCase()}%`); }
  if (filters.hasEmail) where.push("(l.primary_email IS NOT NULL OR EXISTS (SELECT 1 FROM lead_contacts lc WHERE lc.lead_id = l.id AND lc.type = 'email'))");
  if (filters.hasPhone) where.push("(l.primary_phone IS NOT NULL OR EXISTS (SELECT 1 FROM lead_contacts lc WHERE lc.lead_id = l.id AND lc.type = 'phone'))");
  if (filters.hasInstagram) where.push("EXISTS (SELECT 1 FROM lead_contacts lc WHERE lc.lead_id = l.id AND lc.type = 'instagram')");
  if (filters.hasWebsite) where.push("l.website IS NOT NULL");
  if (filters.source) { where.push("EXISTS (SELECT 1 FROM lead_sources slf WHERE slf.lead_id = l.id AND slf.provider = ?)"); args.push(filters.source); }
  if (filters.status) { where.push("l.status = ?"); args.push(filters.status); }
  if (filters.signal) { where.push("EXISTS (SELECT 1 FROM lead_evidence lef WHERE lef.lead_id = l.id AND lower(lef.value) LIKE ?)"); args.push(`%${filters.signal.toLowerCase()}%`); }
  if (filters.search) { where.push("lower(l.company_name || ' ' || COALESCE(l.website, '') || ' ' || COALESCE(l.description, '')) LIKE ?"); args.push(`%${filters.search.toLowerCase()}%`); }
  if (filters.shortlisted != null) { where.push("l.shortlisted = ?"); args.push(filters.shortlisted ? 1 : 0); }
  const filterSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderColumns = { score: "COALESCE(ls.score, -1)", confidence: "COALESCE(ls.confidence, -1)", date: "l.created_at", name: "l.company_name" } as const;
  const direction = sort.direction === "asc" ? "ASC" : "DESC";
  const scoreCampaignClause = filters.campaignId ? "AND campaign_id = ?" : "";
  const scoreArgs = filters.campaignId ? [filters.campaignId] : [];
  const base = `FROM leads l LEFT JOIN lead_scores ls ON ls.id = (SELECT id FROM lead_scores WHERE lead_id = l.id ${scoreCampaignClause} ORDER BY created_at DESC LIMIT 1) ${filterSql}`;
  const total = (database.$client.prepare(`SELECT count(*) as count ${base}`).get(...scoreArgs, ...args) as { count: number }).count;
  const offset = (Math.max(page, 1) - 1) * pageSize;
  const rows = database.$client.prepare(`SELECT l.*, ls.score, ls.confidence,
    (SELECT group_concat(DISTINCT provider) FROM lead_sources WHERE lead_id = l.id) AS sources,
    (SELECT value FROM lead_contacts WHERE lead_id = l.id AND type = 'instagram' LIMIT 1) AS instagram
    ${base} ORDER BY ${orderColumns[sort.field]} ${direction}, l.company_name ASC LIMIT ? OFFSET ?`).all(...scoreArgs, ...args, pageSize, offset) as LeadListRow[];
  return { total, page: Math.max(page, 1), pageSize, items: rows.map((row) => ({ id: row.id, companyName: row.company_name, industry: row.industry, location: [row.city, row.region, row.country].filter(Boolean).join(", "), opportunity: row.opportunity, email: row.primary_email, phone: row.primary_phone, instagram: row.instagram, website: row.website, sources: row.sources?.split(",") ?? [], status: row.status, shortlisted: Boolean(row.shortlisted), score: row.score, confidence: row.confidence, lastActionAt: row.last_action_at, createdAt: row.created_at })) };
}
