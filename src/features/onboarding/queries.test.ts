import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { saveBusinessProfile } from "@/features/business/actions";
import { createCampaign } from "@/features/campaigns/actions";
import { upsertDiscoveredLead } from "@/features/discovery/service";
import { upsertContentPiece } from "@/features/content/service";
import { leadSummary, onboardingStatus } from "@/features/onboarding/queries";

const perfil = {
  businessName: "LicitaCerta", businessDescription: "Radar de licitações públicas para pequenas empresas",
  offer: "Alerta no WhatsApp", oneLinePitch: "Só as licitações que valem seu tempo", outreachGoal: "Assinaturas",
  callToAction: "Testar", tone: "Direto", targetIndustries: ["ferragens"],
};

describe("painel de primeiros passos", () => {
  it("deriva cada passo do banco, sem flag de concluído", () => {
    const { db } = createTestDatabase();
    const vazio = onboardingStatus(db);
    expect(vazio.done).toBe(0);
    expect(vazio.required).toBe(5); // a biblioteca de conteúdo é opcional e não conta no total
    expect(vazio.steps.find((s) => s.id === "negocio")!.done).toBe(false);

    saveBusinessProfile(db, perfil);
    const campanha = createCampaign(db, { name: "Camp", targetLocations: ["BR"], industries: ["ferragens"], sources: ["instagram"], targetLeadCount: 5, minimumScore: 0, outreachLanguage: "pt-BR" });
    upsertDiscoveredLead(db, campanha.id, { companyName: "Loja do Zé", instagram: "https://instagram.com/lojadoze", sourceUrl: "https://instagram.com/lojadoze" }, "instagram");
    upsertContentPiece(db, { handle: "referencia", externalId: "r1", url: "https://instagram.com/reel/r1", views: 9000 });

    const depois = onboardingStatus(db);
    const porId = Object.fromEntries(depois.steps.map((s) => [s.id, s]));
    expect(porId.negocio.done).toBe(true);
    expect(porId.negocio.detail).toContain("LicitaCerta");
    expect(porId.campanha.done).toBe(true);
    expect(porId.leads.done).toBe(true);
    expect(porId.chrome.done).toBe(false); // sem DM enviada o passo do Chrome continua pendente
    expect(porId.conteudo.done).toBe(true);
    expect(depois.done).toBe(3);
  });

  it("resume os leads por status, canal e funil, e lista os últimos que entraram", () => {
    const { db } = createTestDatabase();
    saveBusinessProfile(db, perfil);
    const campanha = createCampaign(db, { name: "Camp", targetLocations: ["BR"], industries: ["ferragens"], sources: ["instagram"], targetLeadCount: 5, minimumScore: 0, outreachLanguage: "pt-BR" });
    upsertDiscoveredLead(db, campanha.id, { companyName: "Loja A", instagram: "https://instagram.com/a", sourceUrl: "https://instagram.com/a" }, "instagram");
    upsertDiscoveredLead(db, campanha.id, { companyName: "Loja B", email: "b@b.com", sourceUrl: "https://b.com" }, "seed_urls");
    const resumo = leadSummary(db);
    expect(resumo.total).toBe(2);
    expect(resumo.comInstagram).toBe(1);
    expect(resumo.comContato).toBe(1);
    expect(resumo.porStatus.reduce((s, l) => s + l.total, 0)).toBe(2);
    expect(resumo.porFunil[0].valor).toBe("customer");
    expect(resumo.recentes).toHaveLength(2);
    expect(resumo.recentes[0].company_name).toBeTruthy();
  });
});
