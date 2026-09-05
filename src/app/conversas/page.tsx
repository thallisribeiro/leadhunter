import Link from "next/link";
import { db } from "@/db/client";
import { listConversations } from "@/features/conversations/service";
import { channelStateLabels, leadStatusLabels, type LeadStatus } from "@/features/leads/bulk-actions";
import { listExceptions } from "@/features/ops/guard";
import { resolveExceptionAction } from "@/app/instagram-actions";
import { Badge, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function ConversationsPage() {
  const conversations = listConversations(db);
  const exceptions = listExceptions(db);
  const fmt = (iso: string | null) => (iso ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "—");
  return <><PageHeader eyebrow="Conversas" title="Quem respondeu e quem está esperando" description="A primeira DM sai pelo navegador; a resposta chega pelo webhook da Meta e a conversa segue pela API oficial." />
    <section className="detail-section"><h2>Fila de exceções ({exceptions.length})</h2>
      {exceptions.length === 0 ? <p className="muted">Nenhuma exceção aberta.</p> : <table className="table"><thead><tr><th>Quando</th><th>Tipo</th><th>Lead</th><th>Mensagem</th><th></th></tr></thead><tbody>
        {exceptions.map((e) => <tr key={e.id}><td>{fmt(e.created_at)}</td><td><Badge tone={e.kind === "paused" || e.kind === "browser_failure" ? "warning" : "neutral"}>{e.kind}</Badge></td><td>{e.lead_id ? <Link href={`/conversas/${e.lead_id}`}>{e.company_name ?? e.lead_id}</Link> : "—"}</td><td>{e.message}</td><td><form action={resolveExceptionAction}><input type="hidden" name="id" value={e.id} /><button className="button" type="submit">Resolver</button></form></td></tr>)}
      </tbody></table>}
    </section>
    <section className="detail-section"><h2>Conversas ({conversations.length})</h2>
      {conversations.length === 0 ? <EmptyState title="Nenhuma conversa ainda" description="Quando o autopilot ou você enviar a primeira DM, ela aparece aqui com o estado do canal." /> : <table className="table"><thead><tr><th>Lead</th><th>Funil</th><th>Etapa</th><th>Canal</th><th>Dono</th><th>Última mensagem</th><th>Msgs</th><th>Atualizado</th></tr></thead><tbody>
        {conversations.map((c) => <tr key={c.id}><td><Link href={`/conversas/${c.lead_id}`}>{c.company_name}</Link><br /><small className="muted">{c.instagram_handle ? `@${c.instagram_handle}` : ""}</small></td><td>{c.funnel === "affiliate" ? "Afiliado" : "Cliente"}</td><td>{leadStatusLabels[c.lead_status as LeadStatus] ?? c.lead_status}</td><td><Badge tone={c.state === "human_review_required" ? "warning" : c.owner === "api" ? "success" : "neutral"}>{channelStateLabels[c.state] ?? c.state}</Badge></td><td>{c.owner === "api" ? "API oficial" : "Navegador"}</td><td className="truncate">{c.last_text ?? "—"}</td><td>{c.message_count}</td><td>{fmt(c.last_inbound_at ?? c.last_outbound_at ?? c.created_at)}</td></tr>)}
      </tbody></table>}
    </section></>;
}
