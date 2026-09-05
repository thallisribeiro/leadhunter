import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { createCampaign } from "@/features/campaigns/actions";
import { upsertDiscoveredLead } from "@/features/discovery/service";
import { applyBulkAction, updateLeadStatus } from "@/features/leads/bulk-actions";

describe("lead operations", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  test("shortlists multiple leads atomically", () => {
    const database = createTestDatabase(); cleanups.push(database.close);
    const campaign = createCampaign(database.db, { name: "Dentistas Miami", description: "", targetLocations: ["Miami"], industries: ["dentist"], keywords: [], requiredSignals: [], preferredSignals: [], excludedSignals: [], sources: ["csv"], targetLeadCount: 20, minimumScore: 70, outreachLanguage: "pt-BR" });
    const a = upsertDiscoveredLead(database.db, campaign.id, { companyName: "A Dental", sourceUrl: "a.csv" }, "csv");
    const b = upsertDiscoveredLead(database.db, campaign.id, { companyName: "B Dental", sourceUrl: "b.csv" }, "csv");
    expect(applyBulkAction(database.db, { action: "shortlist", leadIds: [a.id, b.id], campaignId: campaign.id })).toEqual({ processed: 2, failed: 0 });
    expect(database.sqlite.prepare("select count(*) as count from leads where shortlisted = 1").get()).toEqual({ count: 2 });
  });

  test("allows manual outcome states and rejects invalid transitions", () => {
    const database = createTestDatabase(); cleanups.push(database.close);
    const campaign = createCampaign(database.db, { name: "Dentistas Miami", description: "", targetLocations: ["Miami"], industries: ["dentist"], keywords: [], requiredSignals: [], preferredSignals: [], excludedSignals: [], sources: ["csv"], targetLeadCount: 20, minimumScore: 70, outreachLanguage: "pt-BR" });
    const lead = upsertDiscoveredLead(database.db, campaign.id, { companyName: "A Dental", sourceUrl: "a.csv" }, "csv");
    updateLeadStatus(database.db, lead.id, "replied");
    expect(database.sqlite.prepare("select status from leads where id = ?").get(lead.id)).toEqual({ status: "replied" });
    expect(() => updateLeadStatus(database.db, lead.id, "hacked" as never)).toThrow(/status/i);
  });
});
