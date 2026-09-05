import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { createCampaign } from "@/features/campaigns/actions";
import { upsertDiscoveredLead } from "@/features/discovery/service";
import { enrichLead, getLeadProfile } from "@/features/enrichment/service";

describe("lead enrichment", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  test("persists extracted contacts and source-linked evidence", async () => {
    const database = createTestDatabase(); cleanups.push(database.close);
    const campaign = createCampaign(database.db, { name: "Dentistas Miami", description: "", targetLocations: ["Miami"], industries: ["dentist"], keywords: [], requiredSignals: [], preferredSignals: [], excludedSignals: [], sources: ["seed_urls"], targetLeadCount: 20, minimumScore: 70, outreachLanguage: "pt-BR" });
    const lead = upsertDiscoveredLead(database.db, campaign.id, { companyName: "Ocean Dental", website: "https://ocean.example", sourceUrl: "https://ocean.example" }, "seed_urls");
    const crawler = { crawl: async () => [{ url: "https://ocean.example/", html: '<title>Ocean Dental</title><meta name="description" content="Cosmetic dentistry"><a href="mailto:care@ocean.example">Email</a><a href="https://instagram.com/oceandental">IG</a><p>Agendamento por telefone</p>' }] };

    await enrichLead(database.db, lead.id, crawler);
    const profile = getLeadProfile(database.db, lead.id);

    expect(profile?.lead.status).toBe("enriched");
    expect(profile?.contacts.map((contact) => contact.value)).toContain("care@ocean.example");
    expect(profile?.evidence.some((evidence) => evidence.sourceUrl === "https://ocean.example/" && evidence.type === "description")).toBe(true);
    expect(profile?.evidence.some((evidence) => evidence.value === "agendamento por telefone")).toBe(true);
  });
});
