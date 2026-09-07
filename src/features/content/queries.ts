import type { AppDatabase } from "@/db/client";

export interface ContentFilters { handle?: string; minViews?: number; minFit?: number; starred?: boolean; search?: string; kind?: string; incluirForaDoTema?: boolean }

// Peça sem NENHUM termo do nicho no texto é referência de formato, não de tema — e foi o que encheu
// a biblioteca de unboxing e motivacional em 07/09/2026. Fica guardada, mas escondida por padrão.
export const FIT_MINIMO = 1;
export type ContentSort = "views" | "fit" | "performance" | "date";

export interface ContentPieceRow {
  id: string; handle: string; accountName: string | null; followers: number | null; url: string; kind: string;
  postedAt: string | null; views: number | null; likes: number | null; comments: number | null; durationSeconds: number | null;
  hook: string | null; caption: string | null; transcript: string | null; fit: number; fitReason: string | null;
  performance: number | null; starred: boolean; mediaPath: string | null;
}

const ORDER: Record<ContentSort, string> = {
  views: "COALESCE(p.views, 0) DESC",
  fit: "p.fit DESC, COALESCE(p.views, 0) DESC",
  performance: "COALESCE(p.performance, 0) DESC",
  date: "COALESCE(p.posted_at, p.created_at) DESC",
};

export function listContentPieces(database: AppDatabase, filters: ContentFilters = {}, sort: ContentSort = "views", limit = 100) {
  const where: string[] = []; const args: Array<string | number> = [];
  if (filters.handle) { where.push("a.handle = ?"); args.push(filters.handle.replace(/^@/, "").toLowerCase()); }
  if (filters.minViews != null) { where.push("COALESCE(p.views, 0) >= ?"); args.push(filters.minViews); }
  const minFit = filters.minFit ?? (filters.incluirForaDoTema ? 0 : FIT_MINIMO);
  if (minFit > 0) { where.push("p.fit >= ?"); args.push(minFit); }
  if (filters.starred) where.push("p.starred = 1");
  if (filters.kind) { where.push("p.kind = ?"); args.push(filters.kind); }
  if (filters.search) { where.push("lower(COALESCE(p.caption, '') || ' ' || COALESCE(p.transcript, '') || ' ' || COALESCE(p.hook, '')) LIKE ?"); args.push(`%${filters.search.toLowerCase()}%`); }
  const sql = `SELECT p.*, a.handle, a.name AS account_name, a.followers FROM content_pieces p JOIN content_accounts a ON a.id = p.account_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${ORDER[sort]} LIMIT ?`;
  const rows = database.$client.prepare(sql).all(...args, limit) as Array<Record<string, unknown>>;
  return rows.map(toPiece);
}

export function getContentPiece(database: AppDatabase, id: string): ContentPieceRow | null {
  const row = database.$client.prepare(`SELECT p.*, a.handle, a.name AS account_name, a.followers FROM content_pieces p
    JOIN content_accounts a ON a.id = p.account_id WHERE p.id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? toPiece(row) : null;
}

export function listContentAccounts(database: AppDatabase) {
  return database.$client.prepare(`SELECT a.*, count(p.id) AS pieces, COALESCE(max(p.views), 0) AS best_views
    FROM content_accounts a LEFT JOIN content_pieces p ON p.account_id = a.id GROUP BY a.id ORDER BY a.followers DESC NULLS LAST, a.handle`)
    .all() as Array<{ id: string; handle: string; name: string | null; followers: number | null; posts: number | null; role: string; median_views: number | null; last_mapped_at: string | null; pieces: number; best_views: number }>;
}

export function contentLibraryStats(database: AppDatabase) {
  const stats = database.$client.prepare(`SELECT count(*) AS pieces, count(DISTINCT account_id) AS accounts,
    COALESCE(sum(CASE WHEN starred = 1 THEN 1 ELSE 0 END), 0) AS starred,
    COALESCE(sum(CASE WHEN transcript IS NOT NULL AND length(transcript) > 40 THEN 1 ELSE 0 END), 0) AS transcribed,
    COALESCE(sum(CASE WHEN fit >= ${FIT_MINIMO} THEN 1 ELSE 0 END), 0) AS on_topic,
    COALESCE(max(CASE WHEN fit >= ${FIT_MINIMO} THEN views END), 0) AS best_views,
    COALESCE(avg(CASE WHEN fit >= ${FIT_MINIMO} THEN fit END), 0) AS average_fit FROM content_pieces`)
    .get() as { pieces: number; accounts: number; starred: number; transcribed: number; on_topic: number; best_views: number; average_fit: number };
  return { ...stats, offTopic: stats.pieces - stats.on_topic, averageFit: Math.round(stats.average_fit) };
}

function toPiece(row: Record<string, unknown>): ContentPieceRow {
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    id: String(row.id), handle: String(row.handle), accountName: (row.account_name as string) ?? null, followers: num(row.followers),
    url: String(row.url), kind: String(row.kind), postedAt: (row.posted_at as string) ?? null,
    views: num(row.views), likes: num(row.likes), comments: num(row.comments), durationSeconds: num(row.duration_seconds),
    hook: (row.hook as string) ?? null, caption: (row.caption as string) ?? null, transcript: (row.transcript as string) ?? null,
    fit: Number(row.fit ?? 0), fitReason: (row.fit_reason as string) ?? null, performance: num(row.performance),
    starred: Boolean(row.starred), mediaPath: (row.media_path as string) ?? null,
  };
}
