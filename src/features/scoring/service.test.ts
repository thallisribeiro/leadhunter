import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { createCampaign } from "@/features/campaigns/actions";
import { upsertDiscoveredLead } from "@/features/discovery/service";
import { scoreLead } from "@/features/scoring/service";

describe("scoring persistence", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  test("scores stored evidence and updates the lead pipeline", () => {
    const database = createTestDatabase(); cleanups.push(database.close);
    const campaign = createCampaign(database.db, { name: "Dentistas Miami", description: "", targetLocations: ["Miami"], industries: ["dentist"], keywords: ["cosmetic dentistry"], requiredSignals: [], preferredSignals: ["odontologia estética"], excludedSignals: [], sources: ["csv"], targetLeadCount: 20, minimumScore: 50, outreachLanguage: "pt-BR" });
    const lead = upsertDiscoveredLead(database.db, campaign.id, { companyName: "Ocean Dental", website: "https://ocean.example", email: "care@ocean.example", city: "Miami", country: "USA", sourceUrl: "fixture.csv" }, "csv");
    const now = new Date().toISOString();
    database.sqlite.prepare("update leads set industry = 'dentist', description = 'Cosmetic dentistry and implants', opportunity = 'Agendamento online não detectado nas páginas analisadas.', status = 'enriched' where id = ?").run(lead.id);
    database.sqlite.prepare("insert into lead_evidence (id, lead_id, type, value, source_url, source_provider, metadata, captured_at) values (?, ?, 'signal', 'odontologia estética', 'https://ocean.example', 'crawler', '{}', ?)").run(crypto.randomUUID(), lead.id, now);

    const result = scoreLead(database.db, lead.id, campaign.id);
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(database.sqlite.prepare("select status from leads where id = ?").get(lead.id)).toEqual({ status: "qualified" });
    expect(database.sqlite.prepare("select count(*) as count from lead_scores").get()).toEqual({ count: 1 });
  });
});
