import Link from "next/link";
import { db } from "@/db/client";
import { contentLibraryStats, listContentAccounts, listContentPieces, type ContentSort } from "@/features/content/queries";
import { rescoreLibraryAction, toggleStarredAction } from "@/app/content-actions";
import { Badge, EmptyState, Input, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const numero = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR"));
const duracao = (s: number | null) => (s == null ? "—" : `${s}s`);

export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const value = (name: string) => (typeof query[name] === "string" ? (query[name] as string) : "");
  const sort = (value("sort") || "views") as ContentSort;
  const pieces = listContentPieces(db, {
    handle: value("handle") || undefined,
    minViews: value("views") ? Number(value("views")) : undefined,
    minFit: value("fit") ? Number(value("fit")) : undefined,
    starred: value("starred") === "yes" || undefined,
    search: value("q") || undefined,
  }, sort);
  const accounts = listContentAccounts(db);
  const stats = contentLibraryStats(db);

  return <>
    <PageHeader eyebrow="Biblioteca" title="Conteúdo do nicho"
      description="O que já provou alcance nas contas que a sua audiência segue, com transcrição e gancho, para modelar a próxima peça em vez de chutar pauta. Alcance e engajamento são do dia da leitura."
      actions={<form action={rescoreLibraryAction}><button className="button" type="submit">Recalcular aderência</button></form>} />

    <section className="overview-grid">
      <div className="metric"><span>Peças guardadas</span><strong>{stats.pieces}</strong></div>
      <div className="metric"><span>Contas mapeadas</span><strong>{stats.accounts}</strong></div>
      <div className="metric"><span>Com transcrição</span><strong>{stats.transcribed}</strong></div>
      <div className="metric"><span>Favoritas</span><strong>{stats.starred}</strong></div>
      <div className="metric"><span>Maior alcance</span><strong>{numero(stats.best_views)}</strong></div>
      <div className="metric"><span>Aderência média</span><strong>{stats.averageFit}</strong></div>
    </section>

    {accounts.length > 0 && <section className="detail-section">
      <h2>Contas mapeadas</h2>
      <table className="table"><thead><tr><th>Conta</th><th>Seguidores</th><th>Peças</th><th>Melhor alcance</th><th>Mediana</th><th>Última leitura</th></tr></thead><tbody>
        {accounts.map((a) => <tr key={a.id}>
          <td><Link href={`/conteudo?handle=${a.handle}`}>@{a.handle}</Link>{a.name ? <><br /><small className="muted">{a.name}</small></> : null}</td>
          <td>{numero(a.followers)}</td><td>{a.pieces}</td><td>{numero(a.best_views)}</td><td>{numero(a.median_views)}</td>
          <td><small className="muted">{a.last_mapped_at?.slice(0, 10) ?? "—"}</small></td>
        </tr>)}
      </tbody></table>
    </section>}

    <form className="filter-bar">
      <Input name="q" defaultValue={value("q")} placeholder="Buscar no gancho, legenda ou transcrição" />
      <select className="input" name="handle" defaultValue={value("handle")}>
        <option value="">Todas as contas</option>
        {accounts.map((a) => <option value={a.handle} key={a.id}>@{a.handle}</option>)}
      </select>
      <Input name="views" type="number" min="0" defaultValue={value("views")} placeholder="Alcance mínimo" />
      <Input name="fit" type="number" min="0" max="100" defaultValue={value("fit")} placeholder="Aderência mín." />
      <select className="input" name="starred" defaultValue={value("starred")}><option value="">Todas</option><option value="yes">Só favoritas</option></select>
      <select className="input" name="sort" defaultValue={sort}>
        <option value="views">Ordenar: alcance</option><option value="fit">Aderência</option>
        <option value="performance">Acima da média da conta</option><option value="date">Data</option>
      </select>
      <button className="button" type="submit">Aplicar filtros</button>
    </form>

    {pieces.length === 0
      ? <EmptyState title="Biblioteca vazia" description="Rode a pesquisa de conteúdo (scripts/insta) e importe com pnpm content:import. Cada Reel entra aqui com alcance, transcrição, gancho e nota de aderência ao seu negócio." />
      : <table className="table"><thead><tr><th>Gancho</th><th>Conta</th><th>Alcance</th><th>Curtidas</th><th>Coment.</th><th>Duração</th><th>Aderência</th><th></th></tr></thead><tbody>
        {pieces.map((p) => <tr key={p.id}>
          <td><Link href={`/conteudo/${p.id}`}>{p.hook ?? "(sem gancho lido)"}</Link>
            {p.performance && p.performance >= 2 ? <> <Badge tone="success">{p.performance}× a mediana</Badge></> : null}</td>
          <td><small className="muted">@{p.handle}</small></td>
          <td>{numero(p.views)}</td><td>{numero(p.likes)}</td><td>{numero(p.comments)}</td><td>{duracao(p.durationSeconds)}</td>
          <td>{p.fit > 0 ? <Badge tone={p.fit >= 50 ? "success" : "neutral"}>{p.fit}</Badge> : <small className="muted">—</small>}</td>
          <td><form action={toggleStarredAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="starred" value={p.starred ? "0" : "1"} />
            <button className="button" type="submit">{p.starred ? "★" : "☆"}</button></form></td>
        </tr>)}
      </tbody></table>}
  </>;
}
