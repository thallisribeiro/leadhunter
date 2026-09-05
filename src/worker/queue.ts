import type { AppDatabase } from "@/db/client";

export const jobTypes = ["discover_leads", "enrich_lead", "score_lead", "generate_outreach", "send_email", "export_campaign", "discover_instagram", "send_instagram_dm", "followup", "process_inbound", "send_api_reply", "send_whatsapp", "autopilot_tick", "rebalance_experiments"] as const;
export type JobType = (typeof jobTypes)[number];
export type JobStatus = "pending" | "running" | "completed" | "failed" | "retry_scheduled" | "dead";

export interface JobRecord {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  idempotencyKey: string;
  workerId: string | null;
  error: string | null;
  nextRunAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface JobRow {
  id: string;
  type: JobType;
  payload: string;
  result: string | null;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  idempotency_key: string;
  worker_id: string | null;
  error: string | null;
  next_run_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    result: row.result ? JSON.parse(row.result) as Record<string, unknown> : null,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    idempotencyKey: row.idempotency_key,
    workerId: row.worker_id,
    error: row.error,
    nextRunAt: row.next_run_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createQueue(database: AppDatabase) {
  const sqlite = database.$client;

  function get(id: string): JobRecord | null {
    const row = sqlite.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
    return row ? mapJob(row) : null;
  }

  function enqueue(input: { type: JobType; payload: Record<string, unknown>; idempotencyKey: string; maxAttempts?: number }, now = new Date()): JobRecord {
    const existing = sqlite.prepare("SELECT * FROM jobs WHERE idempotency_key = ?").get(input.idempotencyKey) as JobRow | undefined;
    if (existing) return mapJob(existing);
    const timestamp = now.toISOString();
    const id = crypto.randomUUID();
    sqlite.prepare(`INSERT INTO jobs (id, type, payload, status, attempts, max_attempts, idempotency_key, next_run_at, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?)`).run(id, input.type, JSON.stringify(input.payload), input.maxAttempts ?? 3, input.idempotencyKey, timestamp, timestamp, timestamp);
    return get(id)!;
  }

  function claimNext(workerId: string, now = new Date()): JobRecord | null {
    const timestamp = now.toISOString();
    const claim = sqlite.transaction(() => {
      const candidate = sqlite.prepare(`SELECT id FROM jobs
        WHERE status IN ('pending', 'retry_scheduled') AND next_run_at <= ?
        ORDER BY created_at ASC LIMIT 1`).get(timestamp) as { id: string } | undefined;
      if (!candidate) return null;
      const result = sqlite.prepare(`UPDATE jobs SET status = 'running', attempts = attempts + 1, worker_id = ?, started_at = ?, updated_at = ?
        WHERE id = ? AND status IN ('pending', 'retry_scheduled')`).run(workerId, timestamp, timestamp, candidate.id);
      return result.changes === 1 ? get(candidate.id) : null;
    });
    return claim();
  }

  function complete(id: string, result: Record<string, unknown>, now = new Date()): JobRecord {
    const timestamp = now.toISOString();
    sqlite.prepare(`UPDATE jobs SET status = 'completed', result = ?, completed_at = ?, updated_at = ?, error = NULL WHERE id = ? AND status = 'running'`)
      .run(JSON.stringify(result), timestamp, timestamp, id);
    const job = get(id);
    if (!job) throw new Error(`Job ${id} not found`);
    return job;
  }

  function fail(id: string, error: string, now = new Date()): JobRecord {
    const job = get(id);
    if (!job) throw new Error(`Job ${id} not found`);
    const timestamp = now.toISOString();
    if (job.attempts >= job.maxAttempts) {
      sqlite.prepare("UPDATE jobs SET status = 'dead', error = ?, updated_at = ? WHERE id = ?").run(error, timestamp, id);
    } else {
      const delayMs = 2 ** job.attempts * 1_000;
      const nextRunAt = new Date(now.getTime() + delayMs).toISOString();
      sqlite.prepare("UPDATE jobs SET status = 'retry_scheduled', error = ?, worker_id = NULL, next_run_at = ?, updated_at = ? WHERE id = ?")
        .run(error, nextRunAt, timestamp, id);
    }
    return get(id)!;
  }

  function recoverStale(now = new Date(), staleAfterMs = 300_000): number {
    const cutoff = new Date(now.getTime() - staleAfterMs).toISOString();
    return sqlite.prepare(`UPDATE jobs SET status = 'retry_scheduled', worker_id = NULL, next_run_at = ?, updated_at = ?, error = 'worker_restarted'
      WHERE status = 'running' AND started_at <= ?`).run(now.toISOString(), now.toISOString(), cutoff).changes;
  }

  return { get, enqueue, claimNext, complete, fail, recoverStale };
}
