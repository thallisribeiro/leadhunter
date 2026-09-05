import Link from "next/link";
import { db } from "@/db/client";
import { campaignStatusLabels, listCampaigns } from "@/features/campaigns/actions";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function CampaignsPage() {
  const campaigns = listCampaigns(db);
  return <><PageHeader eyebrow="Operação" title="Campanhas" description="Cada campanha combina um ICP, fontes e um limite de leads." actions={<Link className="button button-primary" href="/campaigns/new">Nova campanha</Link>} />
    {campaigns.length === 0 ? <EmptyState title="Nenhuma campanha ainda" description="Defina quem encontrar e acompanhe todo o pipeline em um só lugar." action={<Link className="button" href="/campaigns/new">Criar campanha</Link>} /> : <div className="campaign-grid">{campaigns.map((campaign) => <Link className="campaign-row" href={`/campaigns/${campaign.id}`} key={campaign.id}><div><strong>{campaign.name}</strong><small>{campaign.description || campaign.industries.join(", ")}</small></div><span>{campaign.targetLocations.join(", ")}</span><span>{campaign.targetLeadCount} leads</span><Badge tone={campaign.status === "ready" ? "success" : "neutral"}>{campaignStatusLabels[campaign.status]}</Badge></Link>)}</div>}
  </>;
}
