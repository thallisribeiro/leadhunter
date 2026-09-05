import { db } from "@/db/client";
import { listOutreachDrafts } from "@/features/outreach/draft";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function OutreachPage() {
  const drafts = listOutreachDrafts(db);
  return <><PageHeader eyebrow="Abordagens" title="Outreach" description="Revise cada mensagem antes de aprovar. O envio de email permanece em dry-run por padrão." />
    {drafts.length === 0 ? <EmptyState title="Nenhuma abordagem gerada" description="Selecione leads qualificados para criar mensagens ligadas às evidências." /> : <div className="campaign-grid">{drafts.map((draft) => <article className="campaign-row" key={draft.id}><div><strong>{draft.subject ?? draft.channel}</strong><small>{draft.message}</small></div><span>{draft.channel}</span><Badge tone={draft.approved ? "success" : "warning"}>{draft.approved ? "Aprovada" : "Revisar"}</Badge><button className="button" type="button">Copiar</button></article>)}</div>}
  </>;
}
