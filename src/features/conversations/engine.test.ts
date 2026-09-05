import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@/db/testing";
import { saveBusinessProfile } from "@/features/business/actions";
import { createCampaign } from "@/features/campaigns/actions";
import { upsertDiscoveredLead } from "@/features/discovery/service";
import { recordInbound, recordOutbound } from "@/features/conversations/service";
import { classifyIntentHeuristic, composeReply, decideAction, runEngine, violatesClaims } from "@/features/conversations/engine";
import { listExceptions } from "@/features/ops/guard";

function setup(funnel: "customer" | "affiliate" = "customer") {
  const { db } = createTestDatabase();
  saveBusinessProfile(db, { businessName: "Horizonte", ownerName: "Thallis", ownerRole: "Fundador", businessDescription: "Agência fictícia de sites", offer: "Site a partir de R$ 699", oneLinePitch: "Sites que viram conversa no WhatsApp.", howItWorks: "briefing | rascunho em 48h | ajustes", whatsappLink: "https://wa.me/5573999999999", affiliateGroupLink: "https://chat.whatsapp.com/abc", verifiedClaims: ["Entrega em 7 dias"], forbiddenClaims: ["garantia de faturamento"], unverifiedClaims: ["primeiro lugar no Google"], outreachGoal: "Conversa", callToAction: "Posso?", tone: "Direto" });
  const campaign = createCampaign(db, { name: "Campanha", targetLocations: ["BR"], industries: ["x"], sources: ["instagram"], targetLeadCount: 5, minimumScore: 0, outreachLanguage: "pt-BR", funnel });
  const lead = upsertDiscoveredLead(db, campaign.id, { companyName: "Loja Azul", instagram: "https://instagram.com/lojaazul", sourceUrl: "https://instagram.com/lojaazul" }, "instagram");
  recordOutbound(db, { leadId: lead.id, text: "oi", via: "browser", kind: "first_contact" });
  return { db, leadId: lead.id };
}

describe("intent classification", () => {
  it("maps common Portuguese replies to intents, with opt-out and owner checks first", () => {
    expect(classifyIntentHeuristic("por favor não me mande mais mensagem")).toBe("opt_out");
    expect(classifyIntentHeuristic("não sou o dono, só trabalho aqui")).toBe("not_the_owner");
    expect(classifyIntentHeuristic("vou passar pro dono")).toBe("will_forward");
    expect(classifyIntentHeuristic("me chama no whatsapp")).toBe("wants_whatsapp");
    expect(classifyIntentHeuristic("quanto custa?")).toBe("asked_pricing");
    expect(classifyIntentHeuristic("não tenho interesse, obrigado")).toBe("not_interested");
    expect(classifyIntentHeuristic("já tentei isso e não funciona")).toBe("objection");
    expect(classifyIntentHeuristic("como funciona?")).toBe("asked_info");
    expect(classifyIntentHeuristic("pode mandar sim")).toBe("interested");
    expect(classifyIntentHeuristic("hmm")).toBe("ambiguous");
    expect(classifyIntentHeuristic("")).toBe("ambiguous");
  });

  it("decides the action per funnel and composes only from configured facts", () => {
    expect(decideAction("interested", { funnel: "customer" })).toBe("send_whatsapp_link");
    expect(decideAction("interested", { funnel: "affiliate" })).toBe("send_affiliate_link");
    expect(decideAction("interested", { funnel: "customer", alreadyHandedOff: true })).toBe("wait");
    expect(decideAction("ambiguous", { funnel: "customer" })).toBe("escalate");
    const { db } = setup();
    const business = (db.$client.prepare("SELECT 1").get(), { businessName: "Horizonte", ownerName: "Thallis", ownerRole: "Fundador", oneLinePitch: "Pitch.", offer: "R$ 699", howItWorks: "a | b", whatsappLink: "https://wa.me/1", affiliateGroupLink: null, verifiedClaims: ["Entrega em 7 dias"], forbiddenClaims: [], unverifiedClaims: [] });
    const reply = composeReply("send_whatsapp_link", { business: business as never, leadName: "Loja", funnel: "customer" })!;
    expect(reply).toContain("https://wa.me/1");
    expect(reply).toContain("Thallis, fundador da Horizonte");
    expect(composeReply("reply_info", { business: business as never, leadName: "Loja", funnel: "customer" })).toContain("a → b");
    expect(violatesClaims("Temos garantia de faturamento", ["garantia de faturamento"])).toBe(true);
    expect(violatesClaims("Entrega em 7 dias", ["garantia de faturamento"])).toBe(false);
  });
});

describe("engine", () => {
  it("hands off to WhatsApp on interest and logs the decision", async () => {
    const { db, leadId } = setup();
    recordInbound(db, { metaUserId: "u1", mid: "m1", text: "pode mandar sim", at: new Date().toISOString(), leadId });
    const result = await runEngine(db, { leadId, text: "pode mandar sim" });
    expect(result).toMatchObject({ intent: "interested", action: "send_whatsapp_link", needsHuman: false });
    expect(result.reply).toContain("wa.me");
    expect(db.$client.prepare("SELECT status FROM leads WHERE id = ?").get(leadId)).toEqual({ status: "whatsapp_handoff" });
    expect(db.$client.prepare("SELECT intent FROM messages WHERE lead_id = ? AND direction = 'in'").get(leadId)).toEqual({ intent: "interested" });
    expect(db.$client.prepare("SELECT count(*) AS n FROM ai_decisions").get()).toEqual({ n: 1 });
  });

  it("opt-out suppresses immediately; ambiguous escalates to a human without replying", async () => {
    const { db, leadId } = setup();
    const out = await runEngine(db, { leadId, text: "para de me mandar isso" });
    expect(out.action).toBe("opt_out");
    expect(db.$client.prepare("SELECT status FROM leads WHERE id = ?").get(leadId)).toEqual({ status: "do_not_contact" });
    const other = setup();
    const esc = await runEngine(other.db, { leadId: other.leadId, text: "???" });
    expect(esc).toMatchObject({ action: "escalate", reply: null, needsHuman: true });
    expect(listExceptions(other.db)[0]).toMatchObject({ kind: "needs_human" });
  });

  it("uses the LLM when present but drops replies that carry forbidden or unverified claims", async () => {
    const { db, leadId } = setup();
    const llm = { classify: async () => "asked_pricing" as const, compose: async () => "Custa R$ 699 e temos garantia de faturamento e primeiro lugar no Google." };
    const result = await runEngine(db, { leadId, text: "valor?", llm, modelLabel: "test-model" });
    expect(result.action).toBe("reply_pricing");
    expect(result.reply).not.toContain("garantia");
    const decision = db.$client.prepare("SELECT reasoning, model FROM ai_decisions").get() as { reasoning: string; model: string };
    expect(decision.model).toBe("test-model");
    expect(decision.reasoning).toContain("descartada");
    const ok = { classify: async () => "asked_info" as const, compose: async () => "Funciona em três passos e entregamos em 7 dias." };
    expect((await runEngine(db, { leadId, text: "como funciona", llm: ok })).reply).toBe("Funciona em três passos e entregamos em 7 dias.");
  });
});
