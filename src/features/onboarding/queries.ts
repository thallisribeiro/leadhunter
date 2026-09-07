import type { AppDatabase } from "@/db/client";
import { getBusinessProfile } from "@/features/business/actions";

// Painel de primeiros passos (07/09/2026). O onboarding era um formulário de uma vez só: depois de
// salvar, o operador caía num painel vazio sem saber o que fazer nem o que já tinha entrado na base.
// Aqui cada passo é DERIVADO do banco (não há flag de "concluído" para desincronizar) e vem junto o
// resumo dos leads importados, que é o que a pessoa quer ver logo depois de importar uma lista.

export interface OnboardingStep {
  id: string; title: string; done: boolean; detail: string; href: string; action: string; optional?: boolean;
}

interface Contagem { valor: string; total: number }

export function leadSummary(database: AppDatabase) {
  const total = (database.$client.prepare("SELECT count(*) AS n FROM leads").get() as { n: number }).n;
  const porStatus = database.$client.prepare("SELECT status AS valor, count(*) AS total FROM leads GROUP BY status ORDER BY total DESC").all() as Contagem[];
  const porFunil = database.$client.prepare("SELECT funnel AS valor, count(*) AS total FROM leads GROUP BY funnel ORDER BY total DESC").all() as Contagem[];
  const porCanal = database.$client.prepare("SELECT channel_state AS valor, count(*) AS total FROM leads GROUP BY channel_state ORDER BY total DESC").all() as Contagem[];
  const comInstagram = (database.$client.prepare("SELECT count(*) AS n FROM leads WHERE instagram_handle IS NOT NULL").get() as { n: number }).n;
  const comContato = (database.$client.prepare("SELECT count(*) AS n FROM leads WHERE primary_email IS NOT NULL OR primary_phone IS NOT NULL").get() as { n: number }).n;
  const recentes = database.$client.prepare(`SELECT l.id, l.company_name, l.status, l.funnel, l.instagram_handle, l.city, l.created_at,
    (SELECT score FROM lead_scores WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) AS score
    FROM leads l ORDER BY l.created_at DESC LIMIT 10`)
    .all() as Array<{ id: string; company_name: string; status: string; funnel: string; instagram_handle: string | null; city: string | null; created_at: string; score: number | null }>;
  return { total, porStatus, porFunil, porCanal, comInstagram, comContato, recentes };
}

export function onboardingStatus(database: AppDatabase) {
  const um = (sql: string) => (database.$client.prepare(sql).get() as { n: number }).n;
  const perfil = getBusinessProfile(database);
  const campanhas = um("SELECT count(*) AS n FROM campaigns");
  const leads = um("SELECT count(*) AS n FROM leads");
  const enviadas = um("SELECT count(*) AS n FROM messages WHERE direction = 'out'");
  const respostas = um("SELECT count(*) AS n FROM messages WHERE direction = 'in'");
  const conteudo = um("SELECT count(*) AS n FROM content_pieces");
  const steps: OnboardingStep[] = [
    { id: "negocio", title: "Descrever o negócio e o ICP", done: Boolean(perfil), href: "/settings/business", action: "Abrir configurações",
      detail: perfil ? `${perfil.businessName}: ${perfil.targetIndustries.slice(0, 3).join(", ") || "sem segmentos"}` : "Sem isso o agente não sabe quem procurar nem o que pode afirmar." },
    { id: "campanha", title: "Criar a primeira campanha", done: campanhas > 0, href: "/campaigns/new", action: "Nova campanha",
      detail: campanhas > 0 ? `${campanhas} campanha(s) criada(s)` : "A campanha define fonte, região e meta de leads." },
    { id: "leads", title: "Encontrar leads", done: leads > 0, href: "/leads", action: "Ver leads",
      detail: leads > 0 ? `${leads} lead(s) na base` : "Descubra por Instagram, CSV, OpenStreetMap ou URLs." },
    { id: "chrome", title: "Conectar o seu Chrome", done: enviadas > 0, href: "/settings/instagram", action: "Estado do Instagram",
      detail: enviadas > 0 ? `${enviadas} DM(s) registrada(s)` : "A primeira DM sai do seu navegador logado, com ritmo humano." },
    { id: "resposta", title: "Receber a primeira resposta", done: respostas > 0, href: "/conversas", action: "Conversas",
      detail: respostas > 0 ? `${respostas} resposta(s) recebida(s)` : "Com a API da Meta ligada, a conversa continua sozinha." },
    { id: "conteudo", title: "Montar a biblioteca de conteúdo", done: conteudo > 0, href: "/conteudo", action: "Biblioteca", optional: true,
      detail: conteudo > 0 ? `${conteudo} peça(s) guardada(s)` : "Guarde o que performou no nicho para modelar o seu conteúdo." },
  ];
  return { steps, done: steps.filter((s) => s.done && !s.optional).length, required: steps.filter((s) => !s.optional).length };
}
