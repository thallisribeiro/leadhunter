import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { needsOnboarding } from "@/features/business/actions";
import { listCampaigns } from "@/features/campaigns/actions";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  if (needsOnboarding(db)) redirect("/onboarding");
  const campaignCount = listCampaigns(db).length;
  return <><PageHeader eyebrow="Visão geral" title="Quem você deve prospectar agora?" description="Priorize empresas com bom encaixe e evidência suficiente para uma abordagem relevante." actions={<Link className="button button-primary" href="/campaigns/new">Nova campanha <span>→</span></Link>} />
    <section className="overview-grid" aria-label="Indicadores"><div className="metric"><span>Campanhas</span><strong>{campaignCount}</strong></div><div className="metric"><span>Leads descobertos</span><strong>0</strong></div><div className="metric"><span>Qualificados</span><strong>0</strong></div><div className="metric"><span>Custo IA</span><strong>US$ 0</strong></div></section>
    <div className="empty-state" style={{marginTop:24}}><div className="empty-mark">◎</div><h2>A fila de prioridade começa aqui</h2><p>Crie uma campanha e inicie a caça para receber sua primeira lista pesquisada.</p><Link className="button" href="/campaigns/new">Criar minha primeira campanha</Link></div></>;
}
