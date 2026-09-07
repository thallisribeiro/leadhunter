import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { saveBusinessProfile } from "@/features/business/actions";
import { extractHook, profileKeywords, rescoreLibrary, scoreFit, setAccountMedian, setStarred, upsertContentAccount, upsertContentPiece } from "@/features/content/service";
import { contentLibraryStats, getContentPiece, listContentAccounts, listContentPieces } from "@/features/content/queries";

const perfil = {
  businessName: "LicitaCerta", businessDescription: "Radar de licitações públicas para pequenas empresas",
  offer: "Alerta diário no WhatsApp das licitações do ramo da empresa", oneLinePitch: "Só as licitações que valem seu tempo",
  outreachGoal: "Assinaturas", callToAction: "Testar o radar", tone: "Direto",
  targetIndustries: ["ferragens", "papelaria"], targetKeywords: ["licitação", "pregão", "PNCP"],
  positiveSignals: ["vende para prefeitura"], affiliateTopics: ["consultoria em licitação"],
};

describe("biblioteca de conteúdo", () => {
  it("extractHook pega a primeira frase falada e cai pra legenda quando não há transcrição", () => {
    expect(extractHook("Se você já tem um MEI aberto, você pode vender pro governo. Vou te mostrar como.", null))
      .toBe("Se você já tem um MEI aberto, você pode vender pro governo.");
    expect(extractHook(null, "Como achar licitação do seu ramo")).toBe("Como achar licitação do seu ramo");
    expect(extractHook(null, null)).toBeNull();
    expect(extractHook("oi", "legenda boa")).toBe("oi"); // frase curta demais devolve o texto inteiro, não a legenda
  });

  it("scoreFit é determinístico, ignora acento e explica o que bateu", () => {
    const termos = ["licitação", "pregão", "PNCP", "prefeitura"];
    const alto = scoreFit("Como vender no pregão da prefeitura usando o PNCP e ganhar licitação", termos);
    expect(alto.fit).toBeGreaterThan(50);
    expect(alto.reason).toContain("licitacao");
    expect(scoreFit("Receita de bolo de cenoura", termos)).toEqual({ fit: 0, reason: null });
    expect(scoreFit("Como vender no pregao", termos)).toEqual(scoreFit("Como vender no pregão", termos));
    expect(scoreFit("texto", ["ab"]).fit).toBe(0); // termo curto demais não conta
  });

  it("guarda a peça uma vez por URL externa, calcula aderência e não duplica na segunda leitura", () => {
    const { db } = createTestDatabase();
    saveBusinessProfile(db, perfil);
    const termos = profileKeywords(db);
    expect(termos).toContain("licitação");
    const primeira = upsertContentPiece(db, {
      handle: "@PedraoDaLicitacao", externalId: "DHZZ1", url: "https://instagram.com/reel/DHZZ1", views: 34100, likes: 335,
      comments: 58, durationSeconds: 49, postedAt: "2026-09-05", transcript: "Se você já tem um MEI, dá pra vender pro governo por licitação e pregão.",
    }, termos);
    expect(primeira.created).toBe(true);
    expect(primeira.fit).toBeGreaterThan(0);
    const segunda = upsertContentPiece(db, { handle: "pedraodalicitacao", externalId: "DHZZ1", url: "https://instagram.com/reel/DHZZ1", views: 40000 }, termos);
    expect(segunda.created).toBe(false);
    expect(segunda.id).toBe(primeira.id);
    const peca = getContentPiece(db, primeira.id)!;
    expect(peca.views).toBe(40000); // métrica nova entra
    expect(peca.transcript).toContain("MEI"); // transcrição antiga não é apagada por um upsert sem ela
    expect(peca.hook).toBe("Se você já tem um MEI, dá pra vender pro governo por licitação e pregão.");
    expect(listContentAccounts(db)).toHaveLength(1); // handle com @ e maiúscula é a mesma conta
  });

  it("performance compara com a mediana da conta e o recálculo alcança as peças já guardadas", () => {
    const { db } = createTestDatabase();
    saveBusinessProfile(db, perfil);
    upsertContentAccount(db, { handle: "conta", followers: 596000, medianViews: 3141 });
    const fora = upsertContentPiece(db, { handle: "conta", externalId: "a", url: "u/a", views: 34100000, transcript: "licitação e pregão" });
    upsertContentPiece(db, { handle: "conta", externalId: "b", url: "u/b", views: 3000, transcript: "licitação" });
    expect(getContentPiece(db, fora.id)!.performance).toBeGreaterThan(1000);
    setAccountMedian(db, "conta", 5000);
    expect(getContentPiece(db, fora.id)!.performance).toBe(6820);
    const total = rescoreLibrary(db);
    expect(total).toBe(2);
  });

  it("lista filtra por conta, alcance, aderência e favorito, e as estatísticas resumem a biblioteca", () => {
    const { db } = createTestDatabase();
    saveBusinessProfile(db, perfil);
    const bom = upsertContentPiece(db, { handle: "a", externalId: "1", url: "u1", views: 9000, transcript: "licitação pregão PNCP prefeitura ferragens" });
    upsertContentPiece(db, { handle: "b", externalId: "2", url: "u2", views: 100, caption: "bolo de cenoura" });
    setStarred(db, bom.id, true);
    expect(listContentPieces(db, {}, "views")[0].id).toBe(bom.id);
    expect(listContentPieces(db, { handle: "@A" })).toHaveLength(1);
    expect(listContentPieces(db, { minViews: 1000 })).toHaveLength(1);
    expect(listContentPieces(db, { starred: true })).toHaveLength(1);
    expect(listContentPieces(db, { search: "cenoura" })).toHaveLength(1);
    expect(listContentPieces(db, { minFit: 50 }).map((p) => p.id)).toEqual([bom.id]);
    const stats = contentLibraryStats(db);
    expect(stats).toMatchObject({ pieces: 2, accounts: 2, starred: 1, transcribed: 1, best_views: 9000 });
  });
});

// A pesquisa vem de scripts que leem o DOM: bio em várias linhas chega como array e alcance como
// "12,7 mil". Antes disto o driver recebia um array e quebrava com "Too many parameter values".
describe("campos vindos da raspagem", () => {
  it("aceita array na bio e número em texto, sem quebrar o driver", () => {
    const { db } = createTestDatabase();
    upsertContentAccount(db, { handle: "conta", bio: ["linha um", "linha dois"] as unknown as string, followers: "12.700" as unknown as number });
    const conta = listContentAccounts(db)[0];
    expect(conta.followers).toBe(12700);
    const peca = upsertContentPiece(db, { handle: "conta", externalId: "z", url: "u/z", views: "9.100" as unknown as number, caption: ["a", "b"] as unknown as string });
    expect(getContentPiece(db, peca.id)!.views).toBe(9100);
    expect(getContentPiece(db, peca.id)!.caption).toBe("a · b");
  });
});
