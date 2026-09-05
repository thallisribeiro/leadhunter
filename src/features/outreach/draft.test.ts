import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { saveBusinessProfile } from "@/features/business/actions";
import { createCampaign } from "@/features/campaigns/actions";
import { upsertDiscoveredLead } from "@/features/discovery/service";
import { generateOutreachDraft } from "@/features/outreach/draft";

describe("evidence-bound outreach drafts", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  test("uses stored evidence and verified claims without forbidden claims", () => {
    const database = createTestDatabase(); cleanups.push(database.close);
    saveBusinessProfile(database.db, { businessName: "Horizonte", website: "", businessDescription: "Agência fictícia para negócios locais", offer: "Sites orientados a conversão", oneLinePitch: "Criamos sites que facilitam o contato comercial", averageTicket: null, salesGoal: "", verifiedClaims: ["Atendimento em português e inglês"], forbiddenClaims: ["Garantimos dobrar o faturamento"], targetIndustries: ["dentist"], targetBusinessTypes: [], targetLocations: ["Miami"], targetCompanySize: "", targetKeywords: [], positiveSignals: [], negativeSignals: [], exclusions: [], outreachGoal: "Agendar conversa", callToAction: "Faz sentido eu enviar duas ideias?", tone: "direto", outreachLanguage: "pt-BR", exampleMessages: [], additionalInstructions: "" });
    const campaign = createCampaign(database.db, { name: "Dentistas Miami", description: "", targetLocations: ["Miami"], industries: ["dentist"], keywords: [], requiredSignals: [], preferredSignals: [], excludedSignals: [], sources: ["csv"], targetLeadCount: 20, minimumScore: 70, outreachLanguage: "pt-BR" });
    const lead = upsertDiscoveredLead(database.db, campaign.id, { companyName: "Ocean Dental", email: "care@ocean.example", sourceUrl: "fixture.csv" }, "csv");
    const evidenceId = crypto.randomUUID();
    database.sqlite.prepare("insert into lead_evidence (id, lead_id, type, value, source_url, source_provider, metadata, captured_at) values (?, ?, 'signal', 'odontologia estética', 'https://ocean.example', 'crawler', '{}', ?)").run(evidenceId, lead.id, new Date().toISOString());

    const draft = generateOutreachDraft(database.db, lead.id, campaign.id, "email");
    expect(draft.message).toContain("odontologia estética");
    expect(draft.message).toContain("Atendimento em português e inglês");
    expect(draft.message).not.toContain("Garantimos dobrar o faturamento");
    expect(draft.evidenceIds).toEqual([evidenceId]);
  });
});
