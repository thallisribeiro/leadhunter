import { db } from "@/db/client";
import { appSettings } from "@/db/schema";

const now = new Date().toISOString();
db.insert(appSettings)
  .values({ key: "seed_version", value: "1", updatedAt: now })
  .onConflictDoUpdate({ target: appSettings.key, set: { value: "1", updatedAt: now } })
  .run();

console.log("Database seed completed.");
