import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { createCampaign } from "@/features/campaigns/actions";
import { upsertDiscoveredLead } from "@/features/discovery/service";
import { getDashboardMetrics, getCampaignOperations } from "@/features/dashboard/queries";

describe("operational metrics", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  test("reports funnel, source, campaign and job metrics from persisted state", () => {
    const database = createTestDatabase(); cleanups.push(database.close);
    const campaign = createCampaign(database.db, { name: "Dentistas Miami", description: "", targetLocations: ["Miami"], industries: ["dentist"], keywords: [], requiredSignals: [], preferredSignals: [], excludedSignals: [], sources: ["csv"], targetLeadCount: 20, minimumScore: 70, outreachLanguage: "pt-BR" });
    const lead = upsertDiscoveredLead(database.db, campaign.id, { companyName: "A Dental", email: "a@dental.example", sourceUrl: "a.csv" }, "csv");
    database.sqlite.prepare("update leads set status = 'qualified', shortlisted = 1 where id = ?").run(lead.id);
    database.sqlite.prepare("insert into ai_calls (id, provider, model, purpose, input_tokens, output_tokens, estimated_cost, latency_ms, status, created_at) values (?, 'mock', 'mock', 'test', 1, 1, 0.25, 1, 'completed', ?)").run(crypto.randomUUID(), new Date().toISOString());

    const metrics = getDashboardMetrics(database.db);
    expect(metrics.discovered).toBe(1); expect(metrics.qualified).toBe(1); expect(metrics.shortlisted).toBe(1); expect(metrics.withEmail).toBe(1); expect(metrics.aiCost).toBe(0.25); expect(metrics.topSources[0]).toEqual({ provider: "csv", count: 1 });
    expect(getCampaignOperations(database.db, campaign.id).found).toBe(1);
  });
});
