import { db } from "@/db/client";
import { createQueue, type JobRecord } from "@/worker/queue";

export type JobHandler = (job: JobRecord) => Promise<Record<string, unknown>>;

export function createWorker(handlers: Partial<Record<JobRecord["type"], JobHandler>>) {
  const queue = createQueue(db);
  const workerId = `worker-${process.pid}`;

  async function runOnce(): Promise<boolean> {
    const job = queue.claimNext(workerId);
    if (!job) return false;
    const handler = handlers[job.type];
    if (!handler) {
      queue.fail(job.id, `No handler registered for ${job.type}`);
      return true;
    }
    try {
      queue.complete(job.id, await handler(job));
    } catch (error) {
      queue.fail(job.id, error instanceof Error ? error.message : "Unknown worker error");
    }
    return true;
  }

  return { runOnce, recover: () => queue.recoverStale() };
}
