import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { assertAiBudgetAvailable, interpretEvidence, recordAiCall } from "@/integrations/llm/client";

describe("optional LLM client", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  test("returns a deterministic evidence-only fallback without a key", async () => {
    const result = await interpretEvidence({ leadName: "Ocean Dental", evidence: [{ id: "evidence-1", type: "signal", value: "odontologia estética", sourceUrl: "https://ocean.example" }], verifiedClaims: ["Atendimento bilíngue"] }, { apiKey: "" });
    expect(result.available).toBe(false);
    expect(result.evidenceIds).toEqual(["evidence-1"]);
    expect(result.whyThisLead).toContain("odontologia estética");
  });

  test("rejects structured output that cites unknown evidence", async () => {
    await expect(interpretEvidence({ leadName: "Ocean Dental", evidence: [{ id: "evidence-1", type: "signal", value: "implantes", sourceUrl: "https://ocean.example" }], verifiedClaims: [] }, { apiKey: "key", transport: async () => ({ whyThisLead: "Boa empresa", opportunity: "Expansão rápida", personalizationHook: "Crescendo muito", evidenceIds: ["invented"] }) })).rejects.toThrow(/evidência/i);
  });

  test("tracks cost and blocks AI work after the monthly budget", () => {
    const database = createTestDatabase(); cleanups.push(database.close);
    recordAiCall(database.db, { provider: "openai-compatible", model: "test", purpose: "classification", inputTokens: 100, outputTokens: 20, estimatedCost: 2.5, latencyMs: 100, status: "completed" });
    expect(() => assertAiBudgetAvailable(database.db, 2)).toThrow(/orçamento/i);
    expect(() => assertAiBudgetAvailable(database.db, 3)).not.toThrow();
  });
});
