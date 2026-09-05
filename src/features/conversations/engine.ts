// Conversation engine: intent → action → reply. Deterministic by default; an LLM can classify and
// draft when configured, but every reply is checked against forbidden claims before it leaves.
import type { AppDatabase } from "@/db/client";
import { getBusinessProfile } from "@/features/business/actions";
import type { BusinessProfile } from "@/features/business/schema";
import { markDoNotContact, timeline } from "@/features/conversations/service";
import { updateLeadStatus } from "@/features/leads/bulk-actions";
import { recordException } from "@/features/ops/guard";

export const intents = ["interested", "asked_info", "asked_pricing", "wants_whatsapp", "not_the_owner", "will_forward", "objection", "not_interested", "opt_out", "ambiguous", "needs_human"] as const;
export type Intent = (typeof intents)[number];
export const actions = ["reply_info", "reply_pricing", "send_whatsapp_link", "send_affiliate_link", "ask_for_owner", "thank_forward", "handle_objection", "close", "escalate", "opt_out", "wait"] as const;
export type Action = (typeof actions)[number];

const RULES: Array<[Intent, RegExp]> = [
  ["opt_out", /\b(n[ãa]o (me )?(mande|manda|envie|envia|chame|chama)|para(r)? de (me )?(mandar|enviar)|me (tira|remove|remova)|remover|descadastr|unsubscribe|stop|spam|bloquear)\b/i],
  ["not_the_owner", /\b(n[ãa]o sou (o|a) (dono|dona|respons[áa]vel|propriet[áa]ri[oa])|sou (s[óo] )?(funcion[áa]ri[oa]|vendedor[a]?|atendente)|quem decide [ée]|falar com (o|a) (dono|dona|gerente))\b/i],
  ["will_forward", /\b(vou (passar|repassar|encaminhar|mostrar)|passo (pro|para o|pra) (dono|dona|gerente|respons)|repasso)\b/i],
  ["wants_whatsapp", /\b(whats(app)?|zap|wpp|me (chama|liga)|meu n[úu]mero|passa (o|seu) (n[úu]mero|contato))\b/i],
  ["asked_pricing", /\b(pre[çc]o|quanto (custa|fica|[ée]|sai)|valor(es)?|mensalidade|plano|tabela|investimento|or[çc]amento|gr[áa]tis|gratuito)\b/i],
  ["not_interested", /\b(n[ãa]o (tenho|temos) interesse|sem interesse|n[ãa]o (preciso|precisamos|quero|queremos)|n[ãa]o obrigad[oa]|j[áa] (tenho|temos|uso|usamos)|deixa (pra|para) (depois|l[áa])|agora n[ãa]o)\b/i],
  ["objection", /\b(caro|n[ãa]o (funciona|confio|acredito)|j[áa] tentei|golpe|desconfi|n[ãa]o (tenho|temos) tempo|d[úu]vido)\b/i],
  ["asked_info", /\b(como funciona|o que [ée]|me (explica|conta|fala)|mais (informa[çc][õo]es|detalhes)|quais|qual|onde|quando|\?)/i],
  ["interested", /\b(sim|quero|pode (mandar|enviar|ser)|manda|envia|bora|vamos|tenho interesse|interess|gostei|legal|top|show|claro|beleza|ok|pode sim|faz sentido)\b/i],
];

export function classifyIntentHeuristic(text: string): Intent {
  const clean = text.trim();
  if (!clean) return "ambiguous";
  for (const [intent, pattern] of RULES) if (pattern.test(clean)) return intent;
  return clean.length > 200 ? "needs_human" : "ambiguous";
}

export function decideAction(intent: Intent, ctx: { funnel: "customer" | "affiliate"; alreadyHandedOff?: boolean }): Action {
  const link: Action = ctx.funnel === "affiliate" ? "send_affiliate_link" : "send_whatsapp_link";
  switch (intent) {
    case "opt_out": return "opt_out";
    case "not_interested": return "close";
    case "needs_human": return "escalate";
    case "ambiguous": return "escalate";
    case "not_the_owner": return "ask_for_owner";
    case "will_forward": return "thank_forward";
    case "objection": return "handle_objection";
    case "asked_pricing": return "reply_pricing";
    case "asked_info": return "reply_info";
    case "wants_whatsapp": return link;
    case "interested": return ctx.alreadyHandedOff ? "wait" : link;
  }
}

function claim(business: BusinessProfile, index: number): string { return business.verifiedClaims[index] ?? ""; }
function sign(business: BusinessProfile): string { return business.ownerName ? `${business.ownerName}${business.ownerRole ? `, ${business.ownerRole.toLowerCase()}` : ""} da ${business.businessName}` : business.businessName; }

// Deterministic replies. Only verified claims, pitch, how-it-works and the configured links appear.
export function composeReply(action: Action, ctx: { business: BusinessProfile; leadName: string; funnel: "customer" | "affiliate" }): string | null {
  const { business } = ctx;
  const how = business.howItWorks ? ` Funciona assim: ${business.howItWorks.split("|").map((s) => s.trim()).filter(Boolean).join(" → ")}.` : "";
  const proof = claim(business, 0) ? ` ${claim(business, 0)}.` : "";
  switch (action) {
    case "reply_info": return `${business.oneLinePitch}${how}${proof} Quer que eu te mande os detalhes pelo WhatsApp?`;
    case "reply_pricing": return business.offer ? `${business.offer}${proof} Se quiser, te explico o que está incluso pelo WhatsApp.` : `Prefiro te passar valores com calma, pelo WhatsApp, para não te mandar número solto aqui. Posso?`;
    case "send_whatsapp_link": return business.whatsappLink ? `Perfeito! Aqui é ${sign(business)}. Me chama neste link que a gente continua por lá: ${business.whatsappLink}` : `Perfeito! Aqui é ${sign(business)}. Me passa o seu WhatsApp que eu te chamo por lá.`;
    case "send_affiliate_link": return business.affiliateGroupLink ? `Que bom! Aqui é ${sign(business)}. O programa funciona com link individual e remuneração por indicação. Entra aqui que eu te explico o resto no grupo: ${business.affiliateGroupLink}` : `Que bom! Aqui é ${sign(business)}. Me passa o seu WhatsApp que te explico o programa por lá.`;
    case "ask_for_owner": return `Entendi, obrigado! Quem seria a melhor pessoa para eu falar sobre isso? Se puder me passar o nome ou o contato, eu sigo por lá.`;
    case "thank_forward": return `Obrigado por repassar! Se preferir, me manda o contato da pessoa que eu explico direto, sem tomar o seu tempo.`;
    case "handle_objection": return `Faz sentido a dúvida.${proof || ` ${business.oneLinePitch}`} Sem compromisso: se quiser, te mostro em dois minutos como funciona e você decide.`;
    case "close": return `Sem problema, obrigado pela atenção! Se um dia fizer sentido, é só me chamar.`;
    case "opt_out": return `Entendido, não te mando mais nada. Obrigado pelo retorno.`;
    case "escalate": case "wait": return null;
  }
}

export function violatesClaims(text: string, forbidden: string[]): boolean {
  const lower = text.toLowerCase();
  return forbidden.some((claim) => claim.trim().length >= 4 && lower.includes(claim.trim().toLowerCase()));
}

export interface LlmConversation { classify(input: { text: string; history: string[] }): Promise<Intent>; compose(input: { action: Action; text: string; history: string[]; business: BusinessProfile; leadName: string }): Promise<string> }

export async function runEngine(database: AppDatabase, input: { leadId: string; text: string; llm?: LlmConversation | null; modelLabel?: string }) {
  const business = getBusinessProfile(database); if (!business) throw new Error("Business profile not configured");
  const lead = database.$client.prepare("SELECT company_name, funnel, status FROM leads WHERE id = ?").get(input.leadId) as { company_name: string; funnel: "customer" | "affiliate"; status: string } | undefined;
  if (!lead) throw new Error("Lead not found");
  const history = timeline(database, input.leadId).messages.map((m) => `${m.direction === "in" ? "lead" : "nós"}: ${m.text}`);
  let intent: Intent; let model: string | null = null; let reasoning = "heurística";
  try { if (input.llm) { intent = await input.llm.classify({ text: input.text, history }); model = input.modelLabel ?? "llm"; reasoning = "llm"; } else intent = classifyIntentHeuristic(input.text); }
  catch (error) { intent = classifyIntentHeuristic(input.text); reasoning = `llm falhou (${error instanceof Error ? error.message : "erro"}), heurística`; }
  const alreadyHandedOff = ["whatsapp_handoff", "joined_affiliate_group", "registered", "active_customer", "active_affiliate"].includes(lead.status);
  const action = decideAction(intent, { funnel: lead.funnel, alreadyHandedOff });
  let reply = composeReply(action, { business, leadName: lead.company_name, funnel: lead.funnel });
  if (reply && input.llm) {
    try {
      const drafted = await input.llm.compose({ action, text: input.text, history, business, leadName: lead.company_name });
      const forbidden = [...business.forbiddenClaims, ...business.unverifiedClaims];
      if (drafted.trim() && !violatesClaims(drafted, forbidden)) reply = drafted.trim(); else reasoning += "; resposta do llm descartada por afirmação proibida";
    } catch { reasoning += "; compose do llm falhou, template"; }
  }
  const conversation = database.$client.prepare("SELECT id FROM conversations WHERE lead_id = ?").get(input.leadId) as { id: string } | undefined;
  database.$client.prepare("INSERT INTO ai_decisions (id, lead_id, conversation_id, intent, action, reply, reasoning, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(crypto.randomUUID(), input.leadId, conversation?.id ?? null, intent, action, reply, reasoning, model, new Date().toISOString());
  database.$client.prepare("UPDATE messages SET intent = ? WHERE lead_id = ? AND direction = 'in' AND intent IS NULL").run(intent, input.leadId);
  if (action === "opt_out") markDoNotContact(database, input.leadId, "Pediu para parar na conversa");
  if (action === "close") updateLeadStatus(database, input.leadId, "closed");
  if (action === "send_whatsapp_link") updateLeadStatus(database, input.leadId, "whatsapp_handoff");
  if (action === "send_affiliate_link" || (intent === "interested" && lead.funnel === "affiliate")) updateLeadStatus(database, input.leadId, "interested");
  if (action === "escalate") { recordException(database, { kind: "needs_human", message: `Intenção "${intent}": ${input.text.slice(0, 300)}`, leadId: input.leadId }); database.$client.prepare("UPDATE leads SET channel_state = 'human_review_required' WHERE id = ?").run(input.leadId); }
  return { intent, action, reply, needsHuman: action === "escalate" };
}
