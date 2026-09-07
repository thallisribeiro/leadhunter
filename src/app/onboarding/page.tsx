import Link from "next/link";
import { db } from "@/db/client";
import { needsOnboarding } from "@/features/business/actions";
import { leadSummary, onboardingStatus } from "@/features/onboarding/queries";
import { BusinessForm } from "@/components/business-form";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const ROTULO_STATUS: Record<string, string> = {
  discovered: "descoberto", enriching: "enriquecendo", enriched: "enriquecido", scored: "pontuado",
  qualified: "qualificado", draft_ready: "rascunho pronto", contacted: "contatado", replied: "respondeu",
  interested: "interessado", won: "ganho", do_not_contact: "não contatar",
};
const ROTULO_CANAL: Record<string, string> = {
  browser_contact_pending: "aguardando 1ª DM", waiting_inbound_reply: "esperando resposta", api_owned: "API da Meta", closed: "encerrado",
};

export default function OnboardingPage() {
  // Sem perfil de negócio o painel não tem o que mostrar: o formulário é o próprio primeiro passo.
  if (needsOnboarding(db)) {
    return <><PageHeader eyebrow="Primeiro acesso" title="Ensine o LeadHunter sobre seu negócio"
      description="Essas informações definem quem procurar, o que considerar um bom lead e quais afirmações podem aparecer nas abordagens." /><BusinessForm /></>;
  }

  const { steps, done, required } = onboardingStatus(db);
  const leads = leadSummary(db);
  const proximo = steps.find((s) => !s.done);

  return <>
    <PageHeader eyebrow="Primeiros passos" title="Onde a sua operação está"
      description={`${done} de ${required} passos concluídos.${proximo ? ` Próximo: ${proximo.title.toLowerCase()}.` : " Tudo pronto — o agente pode rodar sozinho."}`}
      actions={<Link className="button" href={proximo?.href ?? "/"}>{proximo?.action ?? "Ir para a visão geral"}</Link>} />

    <section className="detail-section">
      <h2>Checklist</h2>
      <table className="table"><thead><tr><th>Passo</th><th>Situação</th><th>Estado agora</th><th></th></tr></thead><tbody>
        {steps.map((step) => <tr key={step.id}>
          <td><strong>{step.title}</strong>{step.optional ? <> <small className="muted">(opcional)</small></> : null}</td>
          <td>{step.done ? <Badge tone="success">feito</Badge> : <Badge tone="warning">pendente</Badge>}</td>
          <td><small className="muted">{step.detail}</small></td>
          <td><Link href={step.href}>{step.action} →</Link></td>
        </tr>)}
      </tbody></table>
    </section>

    <section className="overview-grid">
      <div className="metric"><span>Leads na base</span><strong>{leads.total.toLocaleString("pt-BR")}</strong></div>
      <div className="metric"><span>Com Instagram</span><strong>{leads.comInstagram.toLocaleString("pt-BR")}</strong></div>
      <div className="metric"><span>Com e-mail ou telefone</span><strong>{leads.comContato.toLocaleString("pt-BR")}</strong></div>
    </section>

    {leads.total === 0
      ? <EmptyState title="Nenhum lead ainda" description="Crie uma campanha e escolha a fonte: Instagram, CSV, OpenStreetMap ou uma lista de sites." action={<Link className="button" href="/campaigns/new">Criar campanha</Link>} />
      : <>
        <section className="detail-section">
          <h2>Como a base está dividida</h2>
          <div className="ops-grid">
            <div><h3>Por status</h3><table className="table"><tbody>
              {leads.porStatus.map((s) => <tr key={s.valor}><td>{ROTULO_STATUS[s.valor] ?? s.valor}</td><td>{s.total.toLocaleString("pt-BR")}</td></tr>)}
            </tbody></table></div>
            <div><h3>Por canal</h3><table className="table"><tbody>
              {leads.porCanal.map((s) => <tr key={s.valor}><td>{ROTULO_CANAL[s.valor] ?? s.valor}</td><td>{s.total.toLocaleString("pt-BR")}</td></tr>)}
            </tbody></table></div>
            <div><h3>Por funil</h3><table className="table"><tbody>
              {leads.porFunil.map((s) => <tr key={s.valor}><td>{s.valor === "affiliate" ? "afiliados" : "clientes"}</td><td>{s.total.toLocaleString("pt-BR")}</td></tr>)}
            </tbody></table></div>
          </div>
        </section>

        <section className="detail-section">
          <h2>Últimos leads que entraram</h2>
          <table className="table"><thead><tr><th>Empresa</th><th>Instagram</th><th>Local</th><th>Score</th><th>Status</th><th>Entrou</th></tr></thead><tbody>
            {leads.recentes.map((lead) => <tr key={lead.id}>
              <td><Link href={`/leads/${lead.id}`}>{lead.company_name}</Link></td>
              <td>{lead.instagram_handle ? <small className="muted">@{lead.instagram_handle}</small> : "—"}</td>
              <td>{lead.city ?? "—"}</td><td>{lead.score ?? "—"}</td>
              <td>{ROTULO_STATUS[lead.status] ?? lead.status}</td>
              <td><small className="muted">{lead.created_at.slice(0, 10)}</small></td>
            </tr>)}
          </tbody></table>
          <p><Link href="/leads">Ver todos os leads, com filtros →</Link></p>
        </section>
      </>}
  </>;
}
