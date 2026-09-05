import Link from "next/link";
import { db } from "@/db/client";
import { affiliatePipeline, channelStateLabels, customerPipeline, leadStatusLabels } from "@/features/leads/bulk-actions";
import { isPaused } from "@/features/ops/guard";
import { moveLeadAction } from "@/app/instagram-actions";
import { Badge, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

interface Row { id: string; company_name: string; status: string; channel_state: string; instagram_handle: string | null; decision_role: string | null; score: number | null; next_action_at: string | null }

export default async function FunnelPage({ searchParams }: { searchParams: Promise<{ funnel?: string }> }) {
  const { funnel = "customer" } = await searchParams;
  const pipeline = funnel === "affiliate" ? affiliatePipeline : customerPipeline;
  const rows = db.$client.prepare(`SELECT l.id, l.company_name, l.status, l.channel_state, l.instagram_handle, l.decision_role, l.next_action_at,
    (SELECT score FROM lead_scores s WHERE s.lead_id = l.id ORDER BY created_at DESC LIMIT 1) AS score
    FROM leads l WHERE l.funnel = ? AND l.status NOT IN ('do_not_contact','lost') ORDER BY score DESC, l.updated_at DESC`).all(funnel === "affiliate" ? "affiliate" : "customer") as Row[];
  const columns = pipeline.map((status) => ({ status, items: rows.filter((r) => r.status === status || (status === "discovered" && ["enriching", "enriched", "scored"].includes(r.status)) || (status === "qualified" && ["shortlisted", "draft_ready"].includes(r.status)) || (status === "interested" && r.status === "meeting")) }));
  const paused = isPaused(db);
  return <><PageHeader eyebrow="Funil" title={funnel === "affiliate" ? "Afiliados" : "Clientes"} description="Cada coluna é uma etapa do pipeline. O canal (navegador ou API) é um campo separado, mostrado no cartão." actions={<div className="action-row"><Link className={`button ${funnel !== "affiliate" ? "button-primary" : ""}`} href="/funil?funnel=customer">Clientes</Link><Link className={`button ${funnel === "affiliate" ? "button-primary" : ""}`} href="/funil?funnel=affiliate">Afiliados</Link></div>} />
    {paused.paused && <p className="banner-warning" role="status">Operação pausada: {paused.reason}. <Link href="/settings/instagram">Ver e retomar →</Link></p>}
    <div className="kanban" aria-label="Pipeline">
      {columns.map((column) => <section className="kanban-column" key={column.status}><header><strong>{leadStatusLabels[column.status]}</strong><span>{column.items.length}</span></header>
        {column.items.length === 0 && <p className="muted">—</p>}
        {column.items.map((item) => <article className="kanban-card" key={item.id}>
          <Link href={`/leads/${item.id}`}><strong>{item.company_name}</strong></Link>
          <small>{item.instagram_handle ? `@${item.instagram_handle}` : "sem Instagram"}{item.decision_role ? ` · ${item.decision_role}` : ""}{item.score != null ? ` · ${item.score}` : ""}</small>
          <Badge tone={item.channel_state === "human_review_required" ? "warning" : item.channel_state.startsWith("api") ? "success" : "neutral"}>{channelStateLabels[item.channel_state] ?? item.channel_state}</Badge>
          <form action={moveLeadAction} className="kanban-move"><input type="hidden" name="leadId" value={item.id} /><select name="status" defaultValue={item.status} aria-label={`Mover ${item.company_name}`}>{pipeline.map((s) => <option key={s} value={s}>{leadStatusLabels[s]}</option>)}<option value="lost">Perdido</option><option value="do_not_contact">Não contatar</option></select><button className="button" type="submit">Mover</button></form>
        </article>)}
      </section>)}
    </div></>;
}
