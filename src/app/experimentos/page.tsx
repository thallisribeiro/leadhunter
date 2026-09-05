import { db } from "@/db/client";
import { ensureDefaultExperiments, listExperiments, variantMetrics } from "@/features/experiments/service";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function ExperimentsPage() {
  ensureDefaultExperiments(db);
  const experiments = listExperiments(db).map((e) => ({ ...e, metrics: variantMetrics(db, e.id) }));
  const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}%` : "—");
  return <><PageHeader eyebrow="Experimentos" title="Uma variável por vez" description="Cada lead recebe uma variante da mensagem de abertura, sorteada pelo peso. O peso é rebalanceado pelos resultados (resposta, interesse, encaminhamento) com um piso de exploração de 20%, e só depois de 30 envios por variante." />
    {experiments.map((e) => <section className="detail-section" key={e.id}><h2>{e.name}</h2><p className="muted">Variável: {e.variable} · funil {e.funnel === "affiliate" ? "afiliados" : "clientes"} · {e.status}</p>
      <table className="table"><thead><tr><th>Variante</th><th>Modelo</th><th>Peso</th><th>Enviadas</th><th>Responderam</th><th>Interessados</th><th>Encaminhados</th></tr></thead><tbody>
        {e.metrics.map((m) => <tr key={m.variantId}><td><strong>{m.name}</strong></td><td className="truncate">{(db.$client.prepare("SELECT template FROM experiment_variants WHERE id = ?").get(m.variantId) as { template: string }).template}</td><td>{m.weight.toFixed(2)}</td><td>{m.sent}</td><td>{m.replied} <small className="muted">{pct(m.replied, m.sent)}</small></td><td>{m.interested} <small className="muted">{pct(m.interested, m.sent)}</small></td><td>{m.handoff} <small className="muted">{pct(m.handoff, m.sent)}</small></td></tr>)}
      </tbody></table></section>)}
  </>;
}
