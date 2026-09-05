import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { saveBusinessProfile } from "@/features/business/actions";
import { createCampaign } from "@/features/campaigns/actions";
import { upsertDiscoveredLead } from "@/features/discovery/service";
import { updateLeadStatus } from "@/features/leads/bulk-actions";
import { recordOutbound } from "@/features/conversations/service";
import { applyRebalance, assignVariant, ensureDefaultExperiments, listVariants, rebalanceWeights, renderTemplate, variantMetrics } from "@/features/experiments/service";

describe("experiments", () => {
  it("renders templates without leftover placeholders or dangling punctuation", () => {
    expect(renderTemplate("{{saudacao}}, {{nome}}! Vi {{gancho}}.", { saudacao: "Oi", nome: "Ana", gancho: "o post da vitrine" })).toBe("Oi, Ana! Vi o post da vitrine.");
    expect(renderTemplate("{{saudacao}}, {{nome}}! Vi {{gancho}}.", { saudacao: "Oi", nome: "", gancho: "x" })).toBe("Oi! Vi x.");
  });

  it("creates default experiments once and assigns variants sticky per lead", () => {
    const { db } = createTestDatabase();
    const ids = ensureDefaultExperiments(db);
    expect(ensureDefaultExperiments(db)).toEqual(ids);
    expect(listVariants(db, ids.customer)).toHaveLength(2);
    saveBusinessProfile(db, { businessName: "Xis", businessDescription: "Descrição longa", offer: "Oferta", oneLinePitch: "Pitch", outreachGoal: "Meta", callToAction: "CTA", tone: "Tom" });
    const campaign = createCampaign(db, { name: "Camp", targetLocations: ["BR"], industries: ["x"], sources: ["instagram"], targetLeadCount: 5, minimumScore: 0, outreachLanguage: "pt-BR" });
    const lead = upsertDiscoveredLead(db, campaign.id, { companyName: "Loja", instagram: "https://instagram.com/loja", sourceUrl: "https://instagram.com/loja" }, "instagram");
    const first = assignVariant(db, { leadId: lead.id, experimentId: ids.customer, rng: () => 0.99 });
    expect(first.name).toMatch(/^B/);
    expect(assignVariant(db, { leadId: lead.id, experimentId: ids.customer, rng: () => 0 }).id).toBe(first.id);
  });

  it("rebalances only with enough sample, keeps the explore floor, and measures from lead status", () => {
    const metrics = [
      { variantId: "a", name: "A", weight: 1, sent: 40, replied: 10, interested: 4, handoff: 2 },
      { variantId: "b", name: "B", weight: 1, sent: 40, replied: 2, interested: 0, handoff: 0 },
    ];
    expect(rebalanceWeights([{ ...metrics[0]!, sent: 10 }, metrics[1]!]).get("a")).toBe(1);
    const weights = rebalanceWeights(metrics);
    expect(weights.get("a")!).toBeGreaterThan(weights.get("b")!);
    expect(weights.get("b")!).toBeGreaterThanOrEqual(0.19);
    expect(Number((weights.get("a")! + weights.get("b")!).toFixed(2))).toBe(1);

    const { db } = createTestDatabase();
    const ids = ensureDefaultExperiments(db);
    saveBusinessProfile(db, { businessName: "Xis", businessDescription: "Descrição longa", offer: "Oferta", oneLinePitch: "Pitch", outreachGoal: "Meta", callToAction: "CTA", tone: "Tom" });
    const campaign = createCampaign(db, { name: "Camp", targetLocations: ["BR"], industries: ["x"], sources: ["instagram"], targetLeadCount: 5, minimumScore: 0, outreachLanguage: "pt-BR" });
    const [va, vb] = listVariants(db, ids.customer);
    for (let i = 0; i < 4; i++) {
      const lead = upsertDiscoveredLead(db, campaign.id, { companyName: `Loja ${i}`, instagram: `https://instagram.com/loja${i}`, sourceUrl: `https://instagram.com/loja${i}` }, "instagram");
      recordOutbound(db, { leadId: lead.id, text: "oi", via: "browser", kind: "first_contact", variantId: i % 2 ? vb!.id : va!.id });
      if (i === 0) updateLeadStatus(db, lead.id, "interested");
    }
    const measured = variantMetrics(db, ids.customer);
    expect(measured.find((m) => m.variantId === va!.id)).toMatchObject({ sent: 2, replied: 1, interested: 1, handoff: 0 });
    expect(applyRebalance(db, ids.customer, { minSample: 2 }).find((m) => m.variantId === va!.id)!.weight).toBeGreaterThan(0.5);
  });
});
