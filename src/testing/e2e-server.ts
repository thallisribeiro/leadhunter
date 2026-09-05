import concurrently from "concurrently";
import { rmSync } from "node:fs";
import path from "node:path";

const databasePath = path.resolve(process.cwd(), "data", "e2e.db");
for (const file of [databasePath, `${databasePath}-shm`, `${databasePath}-wal`]) rmSync(file, { force: true });
process.env.DATABASE_URL = "file:./data/e2e.db";
process.env.LEADHUNTER_FIXTURE_MODE = "true";
process.env.EMAIL_SENDING_ENABLED = "false";

const { result } = concurrently([
  { command: "next start -p 3210", name: "web", prefixColor: "cyan" },
  { command: "tsx src/worker/process.ts", name: "worker", prefixColor: "green" },
], { killOthersOn: ["failure"], raw: false });

await result;
