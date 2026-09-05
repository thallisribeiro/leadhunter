import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { createCampaign } from "@/features/campaigns/actions";
import { upsertDiscoveredLead } from "@/features/discovery/service";

describe("discovery service", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  test("merges the same company from multiple sources and preserves both sources", () => {
    const database = createTestDatabase(); cleanups.push(database.close);
    const campaign = createCampaign(database.db, { name: "Dentistas Miami", description: "", targetLocations: ["Miami"], industries: ["dentist"], keywords: [], requiredSignals: [], preferredSignals: [], excludedSignals: [], sources: ["csv", "overpass"], targetLeadCount: 20, minimumScore: 70, outreachLanguage: "pt-BR" });

    const fromCsv = upsertDiscoveredLead(database.db, campaign.id, { companyName: "Bright Smile", website: "https://brightsmile.example", city: "Miami", country: "USA", sourceUrl: "leads.csv" }, "csv");
    const fromMap = upsertDiscoveredLead(database.db, campaign.id, { companyName: "Bright Smile Dental", website: "https://www.brightsmile.example/contact", phone: "+1 305 555 0110", city: "Miami", country: "USA", sourceUrl: "https://www.openstreetmap.org/node/1" }, "overpass");

    expect(fromMap.id).toBe(fromCsv.id);
    expect(database.sqlite.prepare("select count(*) as count from leads").get()).toEqual({ count: 1 });
    expect(database.sqlite.prepare("select count(*) as count from lead_sources").get()).toEqual({ count: 2 });
    expect(database.sqlite.prepare("select count(*) as count from campaign_leads").get()).toEqual({ count: 1 });
  });

  test("deduplicates by email when no website exists", () => {
    const database = createTestDatabase(); cleanups.push(database.close);
    const campaign = createCampaign(database.db, { name: "Dentistas Miami", description: "", targetLocations: ["Miami"], industries: ["dentist"], keywords: [], requiredSignals: [], preferredSignals: [], excludedSignals: [], sources: ["csv"], targetLeadCount: 20, minimumScore: 70, outreachLanguage: "pt-BR" });
    const first = upsertDiscoveredLead(database.db, campaign.id, { companyName: "A Dental", email: "hello@adental.example", sourceUrl: "a.csv" }, "csv");
    const second = upsertDiscoveredLead(database.db, campaign.id, { companyName: "A Dental Clinic", email: "HELLO@ADENTAL.EXAMPLE", sourceUrl: "b.csv" }, "csv");
    expect(second.id).toBe(first.id);
  });
});
