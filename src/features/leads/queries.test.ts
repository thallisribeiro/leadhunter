import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { createCampaign } from "@/features/campaigns/actions";
import { upsertDiscoveredLead } from "@/features/discovery/service";
import { listLeads } from "@/features/leads/queries";

describe("lead CRM queries", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  test("filters by campaign, score, contactability, source and text, then sorts", () => {
    const database = createTestDatabase(); cleanups.push(database.close);
    const campaign = createCampaign(database.db, { name: "Dentistas Miami", description: "", targetLocations: ["Miami"], industries: ["dentist"], keywords: [], requiredSignals: [], preferredSignals: [], excludedSignals: [], sources: ["csv"], targetLeadCount: 20, minimumScore: 70, outreachLanguage: "pt-BR" });
    const a = upsertDiscoveredLead(database.db, campaign.id, { companyName: "Ocean Dental", email: "care@ocean.example", city: "Miami", sourceUrl: "fixture.csv" }, "csv");
    upsertDiscoveredLead(database.db, campaign.id, { companyName: "Bay Dental", city: "Miami", sourceUrl: "https://osm.example/2" }, "overpass");
    database.sqlite.prepare("insert into lead_scores (id, lead_id, campaign_id, score, confidence, breakdown, why_this_lead, created_at) values (?, ?, ?, 88, 82, '[]', 'Bom encaixe', ?)").run(crypto.randomUUID(), a.id, campaign.id, new Date().toISOString());

    const result = listLeads(database.db, { campaignId: campaign.id, minimumScore: 80, hasEmail: true, source: "csv", search: "Ocean" }, { field: "score", direction: "desc" }, 1, 25);
    expect(result.total).toBe(1);
    expect(result.items[0]?.companyName).toBe("Ocean Dental");
    expect(result.items[0]?.score).toBe(88);
  });
});
