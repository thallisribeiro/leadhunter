import { mkdirSync } from "node:fs";
import path from "node:path";
import { db } from "@/db/client";

const backupDirectory = path.resolve(process.cwd(), "backups");
mkdirSync(backupDirectory, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = path.join(backupDirectory, `leadhunter-${timestamp}.db`);

await db.$client.backup(destination);
console.log(`Backup criado em ${destination}`);
