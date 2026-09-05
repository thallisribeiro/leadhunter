import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { seedDemoData } from "@/db/fixtures";

const now = new Date().toISOString();
db.insert(appSettings)
  .values({ key: "seed_version", value: "1", updatedAt: now })
  .onConflictDoUpdate({ target: appSettings.key, set: { value: "1", updatedAt: now } })
  .run();

const result = await seedDemoData(db);
console.log(`Demo pronta: ${result.leadIds.length} leads na campanha ${result.campaignId}.`);
