import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { seedDemoData } from "@/db/fixtures";

describe("demo fixtures", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  test("seeds the same 20-lead demo without duplicating campaign data", async () => {
    const database = createTestDatabase(); cleanups.push(database.close);

    const first = await seedDemoData(database.db);
    const second = await seedDemoData(database.db);

    expect(second.campaignId).toBe(first.campaignId);
    expect(database.sqlite.prepare("select count(*) as count from campaigns").get()).toEqual({ count: 1 });
    expect(database.sqlite.prepare("select count(*) as count from leads").get()).toEqual({ count: 20 });
    expect(database.sqlite.prepare("select count(*) as count from campaign_leads").get()).toEqual({ count: 20 });
    expect(database.sqlite.prepare("select count(*) as count from lead_scores").get()).toEqual({ count: 20 });
    expect(database.sqlite.prepare("select count(*) as count from outreach_drafts").get()).toEqual({ count: 5 });
  });
});
