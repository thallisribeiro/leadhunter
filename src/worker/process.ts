import { createWorker } from "@/worker/runner";

const worker = createWorker({});
worker.recover();

async function tick() {
  const worked = await worker.runOnce();
  setTimeout(tick, worked ? 50 : 1_000);
}

void tick();
console.log("LeadHunter worker started.");
