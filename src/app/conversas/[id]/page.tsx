import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { apiMaySend, browserMaySend, timeline } from "@/features/conversations/service";
import { getLeadProfile } from "@/features/enrichment/service";
import { channelStateLabels, leadStatusLabels, type LeadStatus } from "@/features/leads/bulk-actions";
import { enqueueDmAction, manualReplyAction, moveLeadAction } from "@/app/instagram-actions";
import { Badge, PageHeader, Textarea } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const profile = getLeadProfile(db, id); if (!profile) notFound();
  const { lead } = profile; const { conversation, messages, decisions } = timeline(db, id);
  const leadRow = lead as typeof lead & { channel_state: string; instagram_handle: string | null; funnel: string; meta_user_id: string | null; decision_role: string | null };
  const api = apiMaySend(db, id); const browser = browserMaySend(db, id);
  const fmt = (iso: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  const events = [...messages.map((m) => ({ at: m.created_at, kind: m.direction === "in" ? "in" : m.sent_via === "dry_run" ? "dry" : "out", text: m.text, meta: `${m.direction === "in" ? "lead" : m.sent_via === "api" ? "nós · API" : m.sent_via === "dry_run" ? "dry-run" : "nós · navegador"}${m.intent ? ` · ${m.intent}` : ""}` })), ...decisions.map((d) => ({ at: d.created_at, kind: "decision", text: `${d.intent} → ${d.action}${d.reply ? "" : " (sem resposta automática)"}`, meta: `decisão · ${d.model ?? "heurística"} · ${d.reasoning}` }))].sort((a, b) => a.at.localeCompare(b.at));
  return <><PageHeader eyebrow="Conversa" title={lead.company_name} description={`${leadRow.instagram_handle ? `@${leadRow.instagram_handle} · ` : ""}${leadRow.funnel === "affiliate" ? "afiliado" : "cliente"}${leadRow.decision_role ? ` · ${leadRow.decision_role}` : ""}`} actions={<><Badge>{leadStatusLabels[lead.status as LeadStatus] ?? lead.status}</Badge> <Badge tone={conversation?.owner === "api" ? "success" : "neutral"}>{channelStateLabels[leadRow.channel_state] ?? leadRow.channel_state}</Badge></>} />
    <div className="lead-layout"><section className="lead-main">
      <article className="detail-section"><h2>Linha do tempo</h2>
        {events.length === 0 ? <p className="muted">Nenhuma mensagem ainda.</p> : <ol className="timeline">{events.map((e, i) => <li className={`timeline-${e.kind}`} key={`${e.at}-${i}`}><small>{fmt(e.at)} · {e.meta}</small><p>{e.text}</p></li>)}</ol>}
      </article>
      <article className="detail-section"><h2>Responder pela API oficial</h2>
        {api.ok ? <form action={manualReplyAction} className="stack"><input type="hidden" name="leadId" value={id} /><Textarea name="text" rows={3} placeholder="Sua resposta (vai pela API da Meta, dentro da janela de 24h)" required /><button className="button button-primary" type="submit">Enviar resposta</button></form> : <p className="muted">Bloqueado: {api.reason}. {api.reason === "channel_owned_by_browser" ? "O lead ainda não respondeu; a API só assume depois da primeira resposta." : ""}</p>}
      </article>
    </section><aside className="lead-side">
      <div className="detail-section"><h2>Canal</h2><div className="contact-row"><span>Dono</span><strong>{conversation?.owner === "api" ? "API oficial" : "Navegador"}</strong></div><div className="contact-row"><span>Estado</span><strong>{channelStateLabels[conversation?.state ?? leadRow.channel_state] ?? "—"}</strong></div><div className="contact-row"><span>IGSID</span><strong>{leadRow.meta_user_id ?? "—"}</strong></div><div className="contact-row"><span>Última entrada</span><strong>{conversation?.last_inbound_at ? fmt(conversation.last_inbound_at) : "—"}</strong></div><div className="contact-row"><span>Follow-ups</span><strong>{conversation?.followups_sent ?? 0}</strong></div></div>
      <div className="detail-section"><h2>Ações</h2>
        <form action={enqueueDmAction} className="status-actions"><input type="hidden" name="leadId" value={id} />{browser.ok ? <button className="button" name="kind" value="first_contact">Enfileirar 1ª DM</button> : <p className="muted">1ª DM: {browser.reason}</p>}<button className="button" name="kind" value="followup">Enfileirar follow-up</button></form>
        <form action={moveLeadAction} className="status-actions"><input type="hidden" name="leadId" value={id} />{(["interested", "whatsapp_handoff", "registered", "active_customer", "closed", "do_not_contact"] as const).map((s) => <button className="button" name="status" value={s} key={s}>{leadStatusLabels[s]}</button>)}</form>
      </div>
      <div className="detail-section"><h2>Atalhos</h2><p><Link href={`/leads/${id}`}>Perfil completo do lead →</Link></p>{leadRow.instagram_handle && <p><Link href={`https://www.instagram.com/${leadRow.instagram_handle}/`} target="_blank">Abrir no Instagram ↗</Link></p>}</div>
    </aside></div></>;
}
