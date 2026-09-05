import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { needsOnboarding } from "@/features/business/actions";
import { listCampaigns } from "@/features/campaigns/actions";
import { getDashboardMetrics } from "@/features/dashboard/queries";
import { listLeads } from "@/features/leads/queries";
import { isPaused } from "@/features/ops/guard";
import { LeadTable } from "@/components/lead-table";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  if (needsOnboarding(db)) redirect("/onboarding");
  const campaignCount = listCampaigns(db).length;
  const metrics = getDashboardMetrics(db); const paused = isPaused(db);
  const priority = listLeads(db, { minimumScore: 60 }, { field: "score", direction: "desc" }, 1, 8);
  return <><PageHeader eyebrow="Visão geral" title="Quem você deve prospectar agora?" description="Priorize empresas com bom encaixe e evidência suficiente para uma abordagem relevante." actions={<Link className="button button-primary" href="/campaigns/new">Nova campanha <span>→</span></Link>} />
    <section className="overview-grid" aria-label="Indicadores"><div className="metric"><span>Campanhas</span><strong>{campaignCount}</strong></div><div className="metric"><span>Descobertos</span><strong>{metrics.discovered}</strong></div><div className="metric"><span>Enriquecidos</span><strong>{metrics.enriched}</strong></div><div className="metric"><span>Qualificados</span><strong>{metrics.qualified}</strong></div><div className="metric"><span>Shortlist</span><strong>{metrics.shortlisted}</strong></div><div className="metric"><span>Com email</span><strong>{metrics.withEmail}</strong></div><div className="metric"><span>Abordagens</span><strong>{metrics.drafts}</strong></div><div className="metric"><span>Contatados</span><strong>{metrics.contacted}</strong></div><div className="metric"><span>Responderam</span><strong>{metrics.replied}</strong></div><div className="metric"><span>Interessados</span><strong>{metrics.interested}</strong></div><div className="metric"><span>Reuniões</span><strong>{metrics.meetings}</strong></div><div className="metric"><span>Ganhos</span><strong>{metrics.won}</strong></div><div className="metric"><span>Custo IA</span><strong>{new Intl.NumberFormat("pt-BR", { style:"currency", currency:"USD" }).format(metrics.aiCost)}</strong></div></section>
    {paused.paused && <p className="banner-warning" role="status">Operação pausada: {paused.reason}. <Link href="/settings/instagram">Ver e retomar →</Link></p>}
    <section className="overview-grid" aria-label="Instagram"><div className="metric"><span>DMs hoje</span><strong>{metrics.dmsSentToday}</strong></div><div className="metric"><span>DMs em dry-run</span><strong>{metrics.dmDryRuns}</strong></div><div className="metric"><span>Respostas recebidas</span><strong>{metrics.inboundMessages}</strong></div><div className="metric"><span>Encaminhados</span><strong>{metrics.handoffs}</strong></div><div className="metric"><span>Clientes ativos</span><strong>{metrics.activeCustomers}</strong></div><div className="metric"><span>Custo IA / lead</span><strong>{new Intl.NumberFormat("pt-BR", { style:"currency", currency:"USD" }).format(metrics.discovered ? metrics.aiCost / metrics.discovered : 0)}</strong></div><div className="metric"><span>Custo IA / cliente</span><strong>{metrics.activeCustomers ? new Intl.NumberFormat("pt-BR", { style:"currency", currency:"USD" }).format(metrics.aiCost / metrics.activeCustomers) : "—"}</strong></div><div className="metric"><span>Exceções abertas</span><strong>{metrics.openExceptions}</strong></div></section>
    <section className="dashboard-section"><div className="section-heading"><div><p className="eyebrow">Prioridade</p><h2>Melhores leads agora</h2></div><Link href="/leads">Ver todos →</Link></div><LeadTable leads={priority.items} campaignId={listCampaigns(db)[0]?.id} emptyTitle="A fila de prioridade começa aqui" /></section>
    <section className="ops-grid"><article className="detail-section"><h2>Top fontes</h2>{metrics.topSources.length ? metrics.topSources.map((source) => <div className="contact-row" key={source.provider}><span>{source.provider}</span><strong>{source.count} leads</strong></div>) : <p className="muted">Nenhuma fonte processada.</p>}</article><article className="detail-section"><h2>Saúde da operação</h2><div className="contact-row"><span>Score médio</span><strong>{metrics.averageScore.toFixed(1)}</strong></div><div className="contact-row"><span>Jobs executando</span><strong>{metrics.runningJobs}</strong></div><div className="contact-row"><span>Erros recentes</span><strong>{metrics.recentErrors.length}</strong></div></article></section></>;
}
