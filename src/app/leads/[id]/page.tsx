import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getLeadProfile } from "@/features/enrichment/service";
import { Badge, PageHeader } from "@/components/ui";
import { updateLeadStatusAction } from "@/app/lead-actions";
import { leadStatusLabels, type LeadStatus } from "@/features/leads/bulk-actions";

export const dynamic = "force-dynamic";

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const profile = getLeadProfile(db, id); if (!profile) notFound();
  const { lead, contacts, evidence, sources, score } = profile;
  return <><PageHeader eyebrow="Perfil do lead" title={lead.company_name} description={[lead.industry, lead.city, lead.region, lead.country].filter(Boolean).join(" · ") || "Localização não detectada"} actions={<Badge tone={["qualified","shortlisted","draft_ready","replied","interested","meeting","won"].includes(lead.status) ? "success" : "neutral"}>{leadStatusLabels[lead.status as LeadStatus] ?? lead.status}</Badge>} />
    <div className="lead-layout"><section className="lead-main"><div className="score-panel"><div><span>Score</span><strong>{score?.score ?? "—"}<small>/100</small></strong></div><div><span>Confiança</span><strong>{score?.confidence ?? "—"}<small>%</small></strong></div><p>{score?.why_this_lead ?? "O score será calculado após o enriquecimento."}</p></div>
      <article className="detail-section"><h2>Oportunidade encontrada</h2><p>{lead.opportunity ?? "Evidência insuficiente nas páginas analisadas."}</p></article>
      <article className="detail-section"><h2>Evidências</h2>{evidence.length ? <div className="evidence-list">{evidence.map((item) => <div key={item.id}><Badge>{item.type === "signal" ? "Sinal" : "Descrição"}</Badge><p>{item.value}</p><Link href={item.sourceUrl} target="_blank">Ver fonte ↗</Link></div>)}</div> : <p className="muted">Nenhuma evidência coletada ainda.</p>}</article>
    </section><aside className="lead-side"><div className="detail-section"><h2>Atualizar resultado</h2><form action={updateLeadStatusAction} className="status-actions"><input type="hidden" name="leadId" value={lead.id} />{[["replied","Respondeu"],["interested","Interessado"],["meeting","Reunião"],["won","Ganho"],["lost","Perdido"],["do_not_contact","Não contatar"]].map(([status,label]) => <button className="button" name="status" value={status} key={status}>{label}</button>)}</form></div><div className="detail-section"><h2>Contatos</h2>{contacts.length ? contacts.map((contact) => <div className="contact-row" key={contact.id}><span>{contact.type}</span><strong>{contact.value}</strong></div>) : <p className="muted">Não detectados.</p>}</div><div className="detail-section"><h2>Website</h2>{lead.website ? <Link href={lead.website} target="_blank">{lead.website} ↗</Link> : <p className="muted">Não detectado.</p>}</div><div className="detail-section"><h2>Fontes</h2>{sources.map((source) => <Link className="source-link" href={source.sourceUrl} target="_blank" key={`${source.provider}-${source.sourceUrl}`}>{source.provider} ↗</Link>)}</div></aside></div></>;
}
