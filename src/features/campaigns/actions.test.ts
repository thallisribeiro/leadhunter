import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { campaignStatusLabels, createCampaign, getCampaign, updateCampaignStatus } from "@/features/campaigns/actions";

describe("campaigns", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  test("creates a validated draft campaign", () => {
    const database = createTestDatabase();
    cleanups.push(database.close);

    const campaign = createCampaign(database.db, {
      name: "Dentistas Miami",
      description: "Clínicas com oportunidade de melhorar aquisição digital.",
      targetLocations: ["Miami, Florida, USA"],
      industries: ["dentist", "dental clinic"],
      keywords: ["cosmetic dentistry"],
      requiredSignals: ["site ativo"],
      preferredSignals: ["email comercial"],
      excludedSignals: ["permanently closed"],
      sources: ["csv", "seed_urls", "overpass"],
      targetLeadCount: 200,
      minimumScore: 70,
      outreachLanguage: "en-US",
    });

    expect(campaign.status).toBe("draft");
    expect(getCampaign(database.db, campaign.id)?.targetLocations).toEqual(["Miami, Florida, USA"]);
  });

  test("rejects invalid targets and translates every campaign status", () => {
    const database = createTestDatabase();
    cleanups.push(database.close);

    expect(() => createCampaign(database.db, {
      name: "X",
      targetLocations: [],
      industries: [],
      keywords: [],
      requiredSignals: [],
      preferredSignals: [],
      excludedSignals: [],
      sources: [],
      targetLeadCount: 0,
      minimumScore: 101,
      outreachLanguage: "pt-BR",
      description: "",
    })).toThrow();
    expect(Object.keys(campaignStatusLabels)).toHaveLength(8);
  });

  test("persists campaign status transitions", () => {
    const database = createTestDatabase();
    cleanups.push(database.close);
    const campaign = createCampaign(database.db, {
      name: "Dentistas Miami",
      description: "",
      targetLocations: ["Miami"],
      industries: ["dentist"],
      keywords: [], requiredSignals: [], preferredSignals: [], excludedSignals: [],
      sources: ["csv"], targetLeadCount: 20, minimumScore: 70, outreachLanguage: "pt-BR",
    });

    updateCampaignStatus(database.db, campaign.id, "discovering");
    expect(getCampaign(database.db, campaign.id)?.status).toBe("discovering");
  });
});
