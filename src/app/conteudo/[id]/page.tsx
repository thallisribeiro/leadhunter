import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getContentPiece } from "@/features/content/queries";
import { toggleStarredAction } from "@/app/content-actions";
import { Badge, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ContentPiecePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const piece = getContentPiece(db, id);
  if (!piece) notFound();
  const numero = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR"));
  return <>
    <PageHeader eyebrow={`@${piece.handle}`} title={piece.hook ?? "Peça sem gancho lido"}
      description={`${piece.kind} · ${piece.postedAt?.slice(0, 10) ?? "sem data"} · ${numero(piece.views)} de alcance na leitura`}
      actions={<form action={toggleStarredAction}><input type="hidden" name="id" value={piece.id} /><input type="hidden" name="starred" value={piece.starred ? "0" : "1"} />
        <button className="button" type="submit">{piece.starred ? "★ Guardada como referência" : "☆ Guardar como referência"}</button></form>} />

    <section className="overview-grid">
      <div className="metric"><span>Alcance</span><strong>{numero(piece.views)}</strong></div>
      <div className="metric"><span>Curtidas</span><strong>{numero(piece.likes)}</strong></div>
      <div className="metric"><span>Comentários</span><strong>{numero(piece.comments)}</strong></div>
      <div className="metric"><span>Duração</span><strong>{piece.durationSeconds ? `${piece.durationSeconds}s` : "—"}</strong></div>
      <div className="metric"><span>Acima da mediana</span><strong>{piece.performance ? `${piece.performance}×` : "—"}</strong></div>
      <div className="metric"><span>Aderência</span><strong>{piece.fit}</strong></div>
    </section>

    <section className="detail-section">
      <h2>Por que está na biblioteca</h2>
      <p className="muted">{piece.fitReason ?? "Nenhum termo do seu negócio apareceu no texto — é referência de formato, não de tema."}</p>
      <p><Link href={piece.url} target="_blank" rel="noopener">Abrir no Instagram ↗</Link>{piece.mediaPath ? <> · <small className="muted">arquivo local: {piece.mediaPath}</small></> : null}</p>
      {piece.starred ? <Badge tone="success">Referência para modelar</Badge> : null}
    </section>

    {piece.transcript ? <section className="detail-section"><h2>Transcrição</h2><p style={{ whiteSpace: "pre-wrap" }}>{piece.transcript}</p></section> : null}
    {piece.caption ? <section className="detail-section"><h2>Legenda publicada</h2><p style={{ whiteSpace: "pre-wrap" }}>{piece.caption}</p></section> : null}
  </>;
}
