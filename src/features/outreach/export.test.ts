import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { createCampaign } from "@/features/campaigns/actions";
import { upsertDiscoveredLead } from "@/features/discovery/service";
import { exportCampaignCsv } from "@/features/outreach/export";

describe("campaign CSV export", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  test("exports campaign leads with safe CSV escaping", () => {
    const database = createTestDatabase(); cleanups.push(database.close);
    const campaign = createCampaign(database.db, { name: "Dentistas Miami", description: "", targetLocations: ["Miami"], industries: ["dentist"], keywords: [], requiredSignals: [], preferredSignals: [], excludedSignals: [], sources: ["csv"], targetLeadCount: 20, minimumScore: 70, outreachLanguage: "pt-BR" });
    upsertDiscoveredLead(database.db, campaign.id, { companyName: "Bright, Smile", website: "https://bright.example", email: "hello@bright.example", city: "Miami", sourceUrl: "fixture.csv" }, "csv");
    const csv = exportCampaignCsv(database.db, campaign.id);
    expect(csv).toContain("empresa,score,confianca");
    expect(csv).toContain('"Bright, Smile"');
    expect(csv).toContain("hello@bright.example");
  });
});
