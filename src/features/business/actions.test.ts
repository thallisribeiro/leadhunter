import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { getBusinessProfile, needsOnboarding, saveBusinessProfile } from "@/features/business/actions";

const validProfile = {
  businessName: "Estúdio Horizonte",
  website: "https://horizonte.example",
  businessDescription: "Agência fictícia de sites para negócios locais.",
  offer: "Sites orientados a conversão.",
  oneLinePitch: "Transformamos visitas em conversas comerciais.",
  averageTicket: 4500,
  salesGoal: "10 projetos por mês",
  verifiedClaims: ["Atendimento em português e inglês"],
  forbiddenClaims: ["Garantia de aumento de receita"],
  targetIndustries: ["odontologia"],
  targetBusinessTypes: ["clínica odontológica"],
  targetLocations: ["Miami, Florida"],
  targetCompanySize: "2–20 funcionários",
  targetKeywords: ["cosmetic dentistry"],
  positiveSignals: ["odontologia estética"],
  negativeSignals: ["site fora do ar"],
  exclusions: ["franquias nacionais"],
  outreachGoal: "Agendar uma conversa de 15 minutos",
  callToAction: "Faz sentido eu enviar duas ideias?",
  tone: "direto e consultivo",
  outreachLanguage: "pt-BR",
  exampleMessages: ["Notei um ponto específico no site de vocês."],
  additionalInstructions: "Não usar elogios genéricos.",
};

describe("business profile", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

  test("requires onboarding until a complete profile is saved", () => {
    const database = createTestDatabase();
    cleanups.push(database.close);

    expect(needsOnboarding(database.db)).toBe(true);
    saveBusinessProfile(database.db, validProfile);
    expect(needsOnboarding(database.db)).toBe(false);
    expect(getBusinessProfile(database.db)?.verifiedClaims).toEqual(["Atendimento em português e inglês"]);
  });

  test("edits the single business profile instead of creating another", () => {
    const database = createTestDatabase();
    cleanups.push(database.close);
    saveBusinessProfile(database.db, validProfile);
    saveBusinessProfile(database.db, { ...validProfile, offer: "Novo posicionamento" });

    expect(getBusinessProfile(database.db)?.offer).toBe("Novo posicionamento");
    expect(database.sqlite.prepare("select count(*) as count from business_profiles").get()).toEqual({ count: 1 });
  });
});
