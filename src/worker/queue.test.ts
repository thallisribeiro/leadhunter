import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { createQueue } from "@/worker/queue";

describe("durable job queue", () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  test("deduplicates idempotent jobs and claims only once", () => {
    const database = createTestDatabase();
    cleanups.push(database.close);
    const queue = createQueue(database.db);

    const first = queue.enqueue({ type: "discover_leads", payload: { campaignId: "campaign-1" }, idempotencyKey: "discover:campaign-1" });
    const duplicate = queue.enqueue({ type: "discover_leads", payload: { campaignId: "campaign-1" }, idempotencyKey: "discover:campaign-1" });

    expect(duplicate.id).toBe(first.id);
    expect(queue.claimNext("worker-a")?.id).toBe(first.id);
    expect(queue.claimNext("worker-b")).toBeNull();
  });

  test("retries with backoff and eventually moves a job to dead letter", () => {
    const database = createTestDatabase();
    cleanups.push(database.close);
    const queue = createQueue(database.db);
    const job = queue.enqueue({ type: "enrich_lead", payload: { leadId: "lead-1" }, idempotencyKey: "enrich:lead-1", maxAttempts: 2 });

    queue.claimNext("worker-a");
    const retry = queue.fail(job.id, "timeout", new Date("2026-09-05T12:00:00.000Z"));
    expect(retry.status).toBe("retry_scheduled");
    expect(retry.nextRunAt).toBe("2026-09-05T12:00:02.000Z");

    queue.claimNext("worker-a", new Date("2026-09-05T12:00:03.000Z"));
    const dead = queue.fail(job.id, "timeout", new Date("2026-09-05T12:00:04.000Z"));
    expect(dead.status).toBe("dead");
  });

  test("recovers abandoned running jobs after restart", () => {
    const database = createTestDatabase();
    cleanups.push(database.close);
    const queue = createQueue(database.db);
    const job = queue.enqueue(
      { type: "score_lead", payload: { leadId: "lead-1" }, idempotencyKey: "score:lead-1" },
      new Date("2026-09-05T09:59:00.000Z"),
    );

    queue.claimNext("worker-a", new Date("2026-09-05T10:00:00.000Z"));
    expect(queue.recoverStale(new Date("2026-09-05T10:06:00.000Z"), 300_000)).toBe(1);
    expect(queue.get(job.id)?.status).toBe("retry_scheduled");
  });
});
