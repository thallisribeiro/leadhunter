// Onboarding do LicitaCerta no LeadHunter, etapa por etapa, com os dados que já existem em
// RadarLicitacoes (.data/leads, .data/clientes, .data/outreach) e no listener do WhatsApp
// (Squads100). Idempotente: rodar de novo não duplica nada; `--rescore` recalcula os scores.
// Uso: pnpm tsx src/db/onboard-licitacerta.ts [--rescore]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { db } from "@/db/client";
import { saveBusinessProfile } from "@/features/business/actions";
import { createCampaign, listCampaigns } from "@/features/campaigns/actions";
import { upsertDiscoveredLead } from "@/features/discovery/service";
import { updateLeadStatus } from "@/features/leads/bulk-actions";
import { generateOutreachDraft } from "@/features/outreach/draft";
import { exportCampaignCsv } from "@/features/outreach/export";
import { suppress } from "@/features/outreach/suppression";
import { scoreLead } from "@/features/scoring/service";

const RADAR = process.env.RADAR_DIR ?? path.resolve(process.cwd(), "..", "RadarLicitacoes");
const SQUADS_WA = process.env.SQUADS_WA_DIR ?? "C:/Users/thall/Documents/Squads100/_opensquad/core/whatsapp";
const SQUADS_LEADS = process.env.SQUADS_LEADS ?? "C:/Users/thall/Documents/Squads100/_opensquad/_memory/leads.json";
const CONTATOS = ["contatos-vencedores-perfil.json", "contatos-ferragens.json"].map((f) => path.join(RADAR, ".data", "leads", f));
const CONVITE = "https://licitacerta.com.br/comecar?origem=lc-47c53c26";
const SHORTLIST = 50; // 30–50 e-mails/dia (decisão 04/09/2026): a shortlist é a fila do primeiro dia
const sqlite = db.$client;
const log = (step: string, msg: string) => console.log(`[${step}] ${msg}`);
const readJson = <T,>(file: string, fallback: T): T => (existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback);

// ---------------------------------------------------------------- Etapa 1 — Perfil do negócio
saveBusinessProfile(db, {
  businessName: "LicitaCerta",
  website: "https://licitacerta.com.br",
  businessDescription: "Radar de licitações para fornecedores do governo. Lê o PNCP todo dia útil, item por item (material e serviço), cruza com o ramo da empresa (CNAE descoberto na Receita a partir do CNPJ) e avisa no WhatsApp só as licitações compatíveis: órgão, valor, prazo, itens e exigências. Sem painel para aprender, sem cadastro em portal. Porta de entrada: relatório retrovisor por CNPJ, sem login, mostrando o que a empresa venceu e o que deixou passar em jun–jul/2026.",
  offer: "Assinatura R$ 49/mês, preço travado para quem entra agora, sem fidelidade (cancela por WhatsApp). Relatório gratuito do CNPJ sem cadastro. Todo cadastro recebe 3 radares grátis (3 dias COM alerta entregue, não 3 dias corridos) — mas isso NÃO é anunciado no site nem na abordagem: é surpresa no primeiro WhatsApp (decisão 07/09/2026).",
  oneLinePitch: "Só as licitações que valem o seu tempo, no WhatsApp, todo dia útil.",
  averageTicket: 49,
  salesGoal: "1 assinatura paga por autoatendimento até 16/09/2026; indicador que antecede: 10 cadastros no site. Canal frio = WhatsApp em número dedicado (não o de alertas), até 25/dia, cada mensagem sobre uma licitação aberta hoje que casa com o CNAE (disparar.js). E-mail frio: OFF (decisão 05/09/2026, não converte no Brasil). Kill: 100 disparos sem pagante → parar e revisar.",
  verifiedClaims: [
    "Lê o PNCP todo dia útil, item por item, material e serviço",
    "33.964 licitações lidas em jun–jul/2026: R$ 31,4 bi, 2.072 órgãos, 28 UFs",
    "Descobre o ramo da empresa na Receita a partir do CNPJ e sugere as categorias com o jargão dos editais",
    "Alerta no WhatsApp com órgão, valor, prazo, modalidade, itens compatíveis e exigências (garantia, atestado)",
    "Relatório gratuito do CNPJ, sem cadastro: o que a empresa venceu e o que deixou passar",
    "R$ 49/mês, preço travado para quem entra agora, sem fidelidade",
    "Quando o PNCP cai, o radar insiste sozinho e nunca inventa alerta",
    "Cada alerta tem botão 'Serviu' / 'Não era pra mim' e o radar ajusta por cliente",
  ],
  forbiddenClaims: [
    "Cobre todos os portais ou diários municipais (a fonte é só o PNCP)",
    "Garante ganhar licitação",
    "Prometer teste grátis, trial ou 'radares grátis' (existem 3 entregas grátis, mas é surpresa: nunca vai na abordagem nem no site)",
    "Histórico de preço vencedor por item ou órgão (LicitaGov tem, nós não)",
    "Robô de lances, envio de proposta ou gestão de documentos",
    "Mais barato que os concorrentes (Alerta Licitação cobra R$ 44,90)",
    "Assessoria jurídica ou análise de edital por IA",
    "Depoimentos, clientes satisfeitos ou número de clientes (0 pagantes em 05/09/2026)",
  ],
  targetIndustries: ["ferragens", "material de construção", "material elétrico", "autopeças", "máquinas e ferramentas", "tintas", "comércio", "atacadista", "varejista", "fabricação", "distribuidora", "serviços"],
  targetBusinessTypes: ["Fornecedor que já venceu licitação no PNCP nos últimos 60 dias", "ME ou EPP (porte da Receita) com 1–5 compras públicas, até 2 UFs, R$ 5 mil a R$ 300 mil ganhos", "Loja de bairro ou prestador local sem setor de licitação dedicado"],
  targetLocations: ["Brasil"],
  targetCompanySize: "ME/EPP, 1 a 20 funcionários",
  // Vocabulário do nicho (07/09/2026). Além de descrever o ICP, é o que decide a ADERÊNCIA da
  // biblioteca de conteúdo: sem isto, Reel de motivação e unboxing entravam junto com licitação.
  targetKeywords: [
    "licitação", "licitações", "licitar", "licitante", "pregão", "pregoeiro", "PNCP", "edital", "editais",
    "compras públicas", "contratação pública", "registro de preços", "dispensa de licitação", "ata de registro",
    "vender para o governo", "vender para prefeitura", "fornecedor do governo", "compras.gov", "comprasnet",
    "portal de compras", "CNAE", "CAF", "SICAF", "certidão negativa", "habilitação", "proposta comercial",
    "lei 14.133", "contrato público", "empenho", "homologação", "prefeitura", "órgão público", "MEI",
  ],
  positiveSignals: ["venceu licitação", "registro de preços", "pregão", "dispensa", "WhatsApp comercial", "site próprio", "poucas UFs"],
  negativeSignals: ["consultoria em licitações", "assessoria em compras governamentais", "robô de lances", "muitas UFs", "distribuidor nacional"],
  exclusions: ["Porte DEMAIS na Receita (média/grande empresa, tem equipe de licitação)", "Órgão público, autarquia ou consórcio (CNAE 84)", "Empresa que vive de licitação para terceiros (concorrente)", "Quem pediu remoção (opt-out permanente, por telefone)", "Quem já é cliente cadastrado"],
  outreachGoal: "Fazer a empresa ver o próprio relatório (licitacerta.com.br, pelo CNPJ) e cadastrar sozinha em /comecar. A mensagem é dado, não pitch: uma licitação real com nome, valor e prazo.",
  callToAction: `Digite o CNPJ em licitacerta.com.br e veja, sem cadastro, o que passou perto de vocês. Se fizer sentido, o radar fica ativo por R$ 49/mês: ${CONVITE}`,
  tone: "Direto, concreto, de fornecedor para fornecedor. No máximo 4 parágrafos curtos, sempre termina em link. Nunca 'compre meu SaaS'; sempre 'achei uma oportunidade real'.",
  outreachLanguage: "pt-BR",
  exampleMessages: [
    "Assunto: Licitação de R$ 48 mil em material elétrico\n\nOi, Marcos. Vi que a Elétrica Norte trabalha com isso.\n\nFoi aberto um registro de preços de R$ 48.200,00 para material elétrico, com propostas até 12/09 — bateu 82% com o perfil de vocês.\n\nEstou testando o LicitaCerta, que monitora o PNCP e avisa quando encontra uma oportunidade compatível com o que a empresa vende.\n\nPosso te mandar essa e deixar o radar de vocês ativo?",
  ],
  additionalInstructions: "Base legal: legítimo interesse (LGPD art. 7º, IX), contato B2B com empresa que já venceu compra pública; só dado público (PNCP + cadastro da Receita); ver RadarLicitacoes/docs/LGPD.md. Opt-out é reativo e permanente, por telefone. Disparo frio no WhatsApp DESLIGADO por decisão do Thallis (04/09/2026); frio = e-mail. Não prometer cobertura além do PNCP. Concorrentes: Alerta Licitação (R$ 44,90, mais barato), LicitaGov (histórico de preço, WhatsApp, CNAE), Licitei, Effecti, ConLicitação. Posicionar por simplicidade e por valor antes do cadastro, nunca por preço.",
});
log("1/9 perfil", "LicitaCerta salvo (8 claims verificadas, 8 proibidas)");

// ---------------------------------------------------------------- Etapa 2 — Campanha
const NAME = "Vencedores PNCP jun–jul/2026 (Receita)";
// "CNAE" casa com toda descrição gravada em industry/evidência: o filtro de ICP (CNAE 84 fora,
// concorrente fora, 1–5 compras) já foi aplicado por RadarLicitacoes/leads.js antes de chegar aqui.
const INDUSTRIES = ["CNAE", "ferragens", "material de construção", "elétrico", "autopeças", "máquinas", "ferramentas", "tintas", "comércio", "atacad", "varej", "fabricação", "distribui", "serviços", "indústria"];
const campaign = listCampaigns(db).find((c) => c.name === NAME) ?? createCampaign(db, {
  name: NAME,
  description: "ME/EPP que venceram licitação no PNCP em jun–jul/2026 (1–5 compras, ≤2 UFs, R$ 5k–300k), enriquecidas pela Receita (BrasilAPI). Sem e-mail e sem site na origem: o enriquecimento do LeadHunter é o buscador de e-mail que faltava. Porte DEMAIS (média/grande) fica fora.",
  targetLocations: ["Brasil"],
  industries: INDUSTRIES,
  keywords: [],
  requiredSignals: [],
  preferredSignals: ["registro de preços", "pregão", "dispensa"],
  excludedSignals: ["consultoria em licitações", "assessoria em compras", "administração pública"],
  sources: ["csv"],
  targetLeadCount: 2_500,
  minimumScore: 40,
  outreachLanguage: "pt-BR",
});
sqlite.prepare("UPDATE campaigns SET industries = ? WHERE id = ?").run(JSON.stringify(INDUSTRIES), campaign.id);
if (process.argv.includes("--rescore")) sqlite.prepare("DELETE FROM lead_scores WHERE campaign_id = ?").run(campaign.id);
log("2/9 campanha", `${NAME} (${campaign.id})`);

// ---------------------------------------------------------------- Etapa 3 — Descoberta (import da base da Receita)
interface Contato { cnpj: string; nome: string; compras: number; itensGanhos: number; valorGanho: number; ufs: string[]; termos: string[]; razao: string | null; fantasia: string | null; ativa: boolean; cnae: number; cnaeDesc: string; icp: boolean; celular: string | null; fixo: string | null; email: string | null; cidade: string | null; uf: string | null; porte: string | null; socio: string | null }
const removed = sqlite.prepare("DELETE FROM leads WHERE id IN (SELECT lead_id FROM lead_sources WHERE json_extract(metadata, '$.porte') = 'DEMAIS')").run().changes;
const dropEvidence = sqlite.prepare("DELETE FROM lead_evidence WHERE lead_id = ? AND type = ?"); // texto da evidência é refeito a cada rodada
const STOP = new Set(["de", "da", "do", "e", "em", "para", "com", "por", "a", "o"]);
const itens = (termos: string[]) => [...new Set(termos.map((t) => t.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, "").trim()).filter((t) => t.length > 2 && !STOP.has(t)))].slice(0, 3);
const insertEvidence = sqlite.prepare("INSERT INTO lead_evidence (id, lead_id, type, value, source_url, source_provider, captured_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
const setIndustry = sqlite.prepare("UPDATE leads SET industry = COALESCE(industry, ?), description = COALESCE(description, ?) WHERE id = ?");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const skipped = { foraIcp: 0, inativa: 0, grande: 0, repetida: 0 };
const seen = new Set<string>();
const leadsByCnpj = new Map<string, string>();
for (const file of CONTATOS) {
  for (const c of Object.values(readJson<Record<string, Contato>>(file, {}))) {
    if (!c.icp) { skipped.foraIcp++; continue; }
    if (!c.ativa) { skipped.inativa++; continue; }
    if (c.porte === "DEMAIS") { skipped.grande++; continue; }
    if (seen.has(c.cnpj)) { skipped.repetida++; continue; }
    seen.add(c.cnpj);
    const phone = c.celular ?? c.fixo;
    const receitaUrl = `https://brasilapi.com.br/api/cnpj/v1/${c.cnpj}`;
    const lead = upsertDiscoveredLead(db, campaign.id, {
      companyName: c.fantasia || c.razao || c.nome,
      phone: phone ? `+55${phone}` : undefined,
      email: c.email ?? undefined,
      city: c.cidade ?? undefined, region: c.uf ?? undefined, country: "Brasil",
      sourceUrl: receitaUrl, externalId: c.cnpj,
      raw: { cnpj: c.cnpj, razao: c.razao, cnae: c.cnae, cnaeDesc: c.cnaeDesc, porte: c.porte, socio: c.socio, compras: c.compras, itensGanhos: c.itensGanhos, valorGanho: c.valorGanho, ufs: c.ufs, termos: c.termos, origem: path.basename(file) },
    }, "csv");
    leadsByCnpj.set(c.cnpj, lead.id);
    setIndustry.run(c.cnaeDesc, `${c.porte ?? "Empresa"} · CNAE ${c.cnae} · ${c.cnaeDesc}`, lead.id);
    // A evidência do PNCP é a mais recente de propósito: é ela que vira o gancho da abordagem.
    const t0 = new Date(); const t1 = new Date(t0.getTime() + 1000);
    dropEvidence.run(lead.id, "receita_cnae"); dropEvidence.run(lead.id, "pncp_vencedor");
    insertEvidence.run(crypto.randomUUID(), lead.id, "receita_cnae", `CNAE ${c.cnae}: ${c.cnaeDesc}${c.socio ? ` · sócio ${c.socio}` : ""}`, receitaUrl, "brasilapi", t0.toISOString(), JSON.stringify({ porte: c.porte }));
    const lista = itens(c.termos);
    insertEvidence.run(crypto.randomUUID(), lead.id, "pncp_vencedor", `a empresa venceu ${c.compras === 1 ? "1 compra pública" : `${c.compras} compras públicas`} em jun–jul/2026 (${brl(c.valorGanho)}, ${c.ufs.join("/")})${lista.length ? `, com itens como ${lista.join(", ")}` : ""}`, `file://${file}`, "radar-licitacoes", t1.toISOString(), JSON.stringify({ termos: c.termos, ufs: c.ufs, compras: c.compras, valorGanho: c.valorGanho }));
  }
}
log("3/9 descoberta", `${leadsByCnpj.size} CNPJs importados; pulados: ${JSON.stringify(skipped)}; removidos porte DEMAIS: ${removed}`);

// ---------------------------------------------------------------- Etapa 4 — Contatos: WhatsApp verificado pelo listener
const verificados = readJson<Record<string, boolean>>(path.join(SQUADS_WA, "verificados.json"), {});
const hasContact = sqlite.prepare("SELECT 1 FROM lead_contacts WHERE lead_id = ? AND type = ?");
const insertContact = sqlite.prepare("INSERT INTO lead_contacts (id, lead_id, type, value, normalized_value, source_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
const phoneOf = sqlite.prepare("SELECT normalized_phone FROM leads WHERE id = ?");
let whatsapp = 0;
for (const leadId of leadsByCnpj.values()) {
  const phone = (phoneOf.get(leadId) as { normalized_phone: string | null } | undefined)?.normalized_phone;
  if (!phone || verificados[phone] !== true || hasContact.get(leadId, "whatsapp")) continue;
  insertContact.run(crypto.randomUUID(), leadId, "whatsapp", `https://wa.me/${phone}`, phone, `file://${path.join(SQUADS_WA, "verificados.json")}`, new Date().toISOString());
  whatsapp++;
}
log("4/9 contatos", `${whatsapp} WhatsApp confirmados gravados (listener onWhatsApp, ${Object.values(verificados).filter(Boolean).length} verdadeiros na base)`);

// ---------------------------------------------------------------- Etapa 5 — Enriquecimento (site → e-mail)
const comSite = (sqlite.prepare("SELECT count(*) n FROM leads WHERE website IS NOT NULL").get() as { n: number }).n;
log("5/9 enriquecimento", comSite === 0 ? "pulado: nenhum lead tem site (Receita não devolve); precisa de GOOGLE_PLACES_API_KEY para achar site e só então o crawler extrai e-mail" : `${comSite} leads com site: rodar 'Enriquecer' na campanha`);

// ---------------------------------------------------------------- Etapa 6 — Score
const hasScore = sqlite.prepare("SELECT 1 FROM lead_scores WHERE lead_id = ? AND campaign_id = ?");
let scored = 0;
for (const leadId of leadsByCnpj.values()) if (!hasScore.get(leadId, campaign.id)) { scoreLead(db, leadId, campaign.id); scored++; }
log("6/9 score", `${scored} calculados agora`);

// ---------------------------------------------------------------- Etapa 7 — Histórico real: clientes, opt-out, já contatados
interface SquadLead { id: string; etapa: string; telefone_whatsapp?: string | null; nome?: string; origem?: { squad?: string } }
const squadLeads = readJson<SquadLead[] | { leads?: SquadLead[] }>(SQUADS_LEADS, []);
const radarLeads = (Array.isArray(squadLeads) ? squadLeads : squadLeads.leads ?? []).filter((l) => l.origem?.squad === "radar-licitacoes");
const enviados = readJson<Record<string, { numero: string; nome: string; status?: string; agendado?: string }>>(path.join(RADAR, ".data", "outreach", "enviados.json"), {});
const clientesDir = path.join(RADAR, ".data", "clientes");
const clientes = existsSync(clientesDir)
  ? (readJsonDir(clientesDir) as Array<{ cnpj?: string; whatsapp?: string; cliente?: string }>).filter((c) => c.cnpj && !/(\d)\1{4}/.test(c.whatsapp ?? "")) // 5 dígitos repetidos = cadastro de teste
  : [];
sqlite.prepare("DELETE FROM suppressions WHERE reason LIKE 'Cliente cadastrado%'").run(); // refeito abaixo a partir dos clientes reais
function readJsonDir(dir: string) { return readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".visto.json") && !f.startsWith("exemplo")).map((f) => readJson(path.join(dir, f), {})); }
const status = (leadId: string, s: Parameters<typeof updateLeadStatus>[2]) => updateLeadStatus(db, leadId, s);
const h = { won: 0, optOut: 0, contacted: 0, interested: 0 };
const active = new Set(["discovered", "scored", "qualified", "shortlisted", "draft_ready"]);
const statusOf = (leadId: string) => (sqlite.prepare("SELECT status FROM leads WHERE id = ?").get(leadId) as { status: string }).status;
const clienteIds = new Set(clientes.map((c) => leadsByCnpj.get(c.cnpj!)).filter(Boolean));
for (const row of sqlite.prepare("SELECT id FROM leads WHERE status = 'won'").all() as Array<{ id: string }>) if (!clienteIds.has(row.id)) status(row.id, "qualified"); // 'ganho' só para cliente real
for (const c of clientes) {
  const leadId = leadsByCnpj.get(c.cnpj!); if (!leadId) continue;
  if (c.whatsapp) suppress(db, { type: "phone", value: c.whatsapp, reason: `Cliente cadastrado em licitacerta.com.br (${c.cliente ?? c.cnpj})` });
  if (statusOf(leadId) !== "won") { status(leadId, "won"); h.won++; }
}
for (const l of radarLeads) {
  const leadId = leadsByCnpj.get(l.id.replace(/^radar-/, "")); if (!leadId) continue;
  if (l.etapa === "perdido") {
    if (l.telefone_whatsapp) suppress(db, { type: "phone", value: l.telefone_whatsapp, reason: "Pediu remoção no WhatsApp (opt-out permanente, docs/LGPD.md)" });
    suppress(db, { type: "company", value: l.nome ?? "", reason: "Pediu remoção no WhatsApp (opt-out permanente)" });
    if (statusOf(leadId) !== "do_not_contact") { status(leadId, "do_not_contact"); h.optOut++; }
  } else if (l.etapa === "call" && active.has(statusOf(leadId))) { status(leadId, "interested"); h.interested++; }
}
for (const [cnpj, e] of Object.entries(enviados)) {
  const leadId = leadsByCnpj.get(cnpj); if (!leadId || e.status) continue; // status = sem_whatsapp/erro → não foi entregue
  if (active.has(statusOf(leadId))) { status(leadId, "contacted"); h.contacted++; }
}
log("7/9 histórico", `${h.won} clientes (ganho), ${h.optOut} opt-out (não contatar + supressão), ${h.interested} interessado, ${h.contacted} já contatados por WhatsApp em 02–03/09`);

// ---------------------------------------------------------------- Etapa 8 — Shortlist + abordagem (e-mail)
const inQueue = (sqlite.prepare("SELECT count(*) n FROM leads l JOIN campaign_leads cl ON cl.lead_id = l.id WHERE cl.campaign_id = ? AND l.status IN ('shortlisted','draft_ready')").get(campaign.id) as { n: number }).n;
const need = Math.max(0, SHORTLIST - inQueue);
// Regra: qualificado, nunca contatado, com WhatsApp confirmado (contato real existe), maior valor ganho primeiro.
const picks = sqlite.prepare(`SELECT l.id FROM leads l JOIN campaign_leads cl ON cl.lead_id = l.id
  WHERE cl.campaign_id = ? AND l.status = 'qualified' AND EXISTS (SELECT 1 FROM lead_contacts c WHERE c.lead_id = l.id AND c.type = 'whatsapp')
  ORDER BY (SELECT score FROM lead_scores s WHERE s.lead_id = l.id ORDER BY created_at DESC LIMIT 1) DESC,
    (SELECT max(json_extract(ls.metadata, '$.valorGanho')) FROM lead_sources ls WHERE ls.lead_id = l.id) DESC LIMIT ?`).all(campaign.id, need) as Array<{ id: string }>;
for (const p of picks) status(p.id, "shortlisted");
// Rascunho não aprovado é refeito a cada rodada (a evidência que vira o gancho pode ter mudado); aprovado fica.
sqlite.prepare("DELETE FROM outreach_drafts WHERE campaign_id = ? AND approved = 0").run(campaign.id);
const toDraft = sqlite.prepare(`SELECT l.id FROM leads l JOIN campaign_leads cl ON cl.lead_id = l.id WHERE cl.campaign_id = ? AND l.status IN ('shortlisted', 'draft_ready')
  AND NOT EXISTS (SELECT 1 FROM outreach_drafts d WHERE d.lead_id = l.id AND d.campaign_id = cl.campaign_id)`).all(campaign.id) as Array<{ id: string }>;
let drafted = 0;
for (const d of toDraft) { generateOutreachDraft(db, d.id, campaign.id, "whatsapp"); status(d.id, "draft_ready"); drafted++; } // e-mail OFF (decisão 05/09/2026)
log("8/9 abordagem", `${picks.length} entraram na shortlist agora (${inQueue + picks.length}/${SHORTLIST}); ${drafted} rascunhos de WhatsApp gerados, todos aguardando aprovação em /outreach`);

// ---------------------------------------------------------------- Etapa 9 — Exportação
const exportsDir = path.join(process.cwd(), "data", "exports"); mkdirSync(exportsDir, { recursive: true });
const csvPath = path.join(exportsDir, `licitacerta-${new Date().toISOString().slice(0, 10)}.csv`);
writeFileSync(csvPath, exportCampaignCsv(db, campaign.id));
const total = (sqlite.prepare("SELECT status, count(*) n FROM leads l JOIN campaign_leads cl ON cl.lead_id = l.id WHERE cl.campaign_id = ? GROUP BY status ORDER BY n DESC").all(campaign.id) as Array<{ status: string; n: number }>).map((r) => `${r.status}=${r.n}`).join(" ");
log("9/9 exportação", `${csvPath}`);
console.log(`\nResumo da campanha: ${total}`);
