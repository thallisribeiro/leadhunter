import { db } from "@/db/client";
import { tickKey } from "@/features/instagram/autopilot";
import { createQueue } from "@/worker/queue";
import { createWorker } from "@/worker/runner";
import { jobHandlers } from "@/worker/handlers";

const worker = createWorker(jobHandlers);
worker.recover();

let lastTick = "";
function scheduleAutopilot() {
  if (process.env.AUTOPILOT_ENABLED !== "true") return;
  const key = tickKey();
  if (key === lastTick) return;
  lastTick = key;
  createQueue(db).enqueue({ type: "autopilot_tick", payload: {}, idempotencyKey: key });
}

async function tick() {
  scheduleAutopilot();
  const worked = await worker.runOnce();
  setTimeout(tick, worked ? 50 : 1_000);
}

void tick();
console.log(`LeadHunter worker started${process.env.AUTOPILOT_ENABLED === "true" ? " (autopilot on)" : ""}.`);
