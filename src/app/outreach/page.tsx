import { db } from "@/db/client";
import { listOutreachDrafts } from "@/features/outreach/draft";
import { approveDraftAction } from "@/app/lead-actions";
import { CopyButton } from "@/components/copy-button";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function OutreachPage() {
  const drafts = listOutreachDrafts(db);
  return <><PageHeader eyebrow="Abordagens" title="Outreach" description="Revise cada mensagem antes de aprovar. O envio de email permanece em dry-run por padrão." />
    {drafts.length === 0 ? <EmptyState title="Nenhuma abordagem gerada" description="Selecione leads qualificados para criar mensagens ligadas às evidências." /> : <div className="campaign-grid">{drafts.map((draft) => <article className="campaign-row" key={draft.id}><div><strong>{draft.subject ?? draft.channel}</strong><small>{draft.message}</small></div><span>{draft.channel}</span><Badge tone={draft.approved ? "success" : "warning"}>{draft.approved ? "Aprovada" : "Revisar"}</Badge><div className="inline-actions"><CopyButton value={draft.message} />{!draft.approved && <form action={approveDraftAction}><input type="hidden" name="draftId" value={draft.id} /><button className="button button-primary">Aprovar</button></form>}</div></article>)}</div>}
  </>;
}
