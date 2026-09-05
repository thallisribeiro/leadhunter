import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getCampaign, campaignStatusLabels } from "@/features/campaigns/actions";
import { getCampaignOperations } from "@/features/dashboard/queries";
import { listLeads } from "@/features/leads/queries";
import { enqueueCampaignAction, updateCampaignStatusAction } from "@/app/lead-actions";
import { CampaignControls } from "@/components/campaign-controls";
import { LeadTable } from "@/components/lead-table";
import { Badge, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const campaign = getCampaign(db, id); if (!campaign) notFound();
  const metrics = getCampaignOperations(db, id); const leads = listLeads(db, { campaignId: id }, { field:"score", direction:"desc" });
  return <><PageHeader eyebrow="Central da campanha" title={campaign.name} description={campaign.description || `${campaign.industries.join(", ")} em ${campaign.targetLocations.join(", ")}`} actions={<Badge tone={campaign.status === "ready" ? "success" : "neutral"}>{campaignStatusLabels[campaign.status]}</Badge>} />
    <section className="overview-grid"><div className="metric"><span>Meta</span><strong>{campaign.targetLeadCount}</strong></div><div className="metric"><span>Encontrados</span><strong>{metrics.found}</strong></div><div className="metric"><span>Enriquecidos</span><strong>{metrics.enriched}</strong></div><div className="metric"><span>Score ≥ {campaign.minimumScore}</span><strong>{metrics.qualified}</strong></div><div className="metric"><span>Com email</span><strong>{metrics.withEmail}</strong></div></section>
    <CampaignControls campaignId={id} />
    <div className="action-row"><form action={enqueueCampaignAction} className="action-row"><input type="hidden" name="campaignId" value={id} /><button className="button" name="operation" value="enrich">Enriquecer pendentes</button><button className="button" name="operation" value="score">Recalcular scores</button><button className="button" name="operation" value="outreach">Gerar abordagens</button></form><form action={updateCampaignStatusAction}><input type="hidden" name="campaignId" value={id} />{campaign.status === "paused" ? <button className="button" name="status" value="discovering">Continuar</button> : <button className="button" name="status" value="paused">Pausar</button>}</form><Link className="button" href={`/api/exports/campaigns/${id}`}>Exportar CSV</Link></div>
    <LeadTable leads={leads.items} campaignId={id} />
  </>;
}
