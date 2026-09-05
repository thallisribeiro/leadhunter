import { db } from "@/db/client";
import { listCampaigns } from "@/features/campaigns/actions";
import { listLeads } from "@/features/leads/queries";
import { LeadTable } from "@/components/lead-table";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function ShortlistPage() {
  const result = listLeads(db, { shortlisted: true }, { field: "score", direction: "desc" });
  return <><PageHeader eyebrow="Prioridade" title="Shortlist" description="Sua seleção de empresas para revisar e abordar." /><LeadTable leads={result.items} campaignId={listCampaigns(db)[0]?.id} emptyTitle="Sua shortlist está vazia" /></>;
}
