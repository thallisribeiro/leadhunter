// Opening-message experiments: one variable at a time, weighted assignment, sticky per lead,
// rebalanced from measured results with a floor that keeps exploring.
import type { AppDatabase } from "@/db/client";

export interface VariantRow { id: string; experiment_id: string; name: string; template: string; weight: number; created_at: string }
export interface ExperimentRow { id: string; name: string; variable: string; funnel: string; status: string; created_at: string }
export interface VariantMetrics { variantId: string; name: string; weight: number; sent: number; replied: number; interested: number; handoff: number }

export const DEFAULT_VARIANTS: Record<"customer" | "affiliate", Array<{ name: string; template: string }>> = {
  customer: [
    { name: "A · gancho do perfil", template: "{{saudacao}}, {{nome}}! Vi {{gancho}} no perfil de {{empresa}}. {{pitch}} Faz sentido eu te explicar em duas linhas como funciona?" },
    { name: "B · pergunta direta", template: "{{saudacao}}! Sou {{owner}}, da {{negocio}}. Vi {{gancho}} e fiquei curioso: como vocês resolvem isso hoje? Se fizer sentido, te conto em duas linhas o que a gente faz." },
  ],
  affiliate: [
    { name: "A · convite ao programa", template: "{{saudacao}}, {{nome}}! Acompanho seu conteúdo sobre {{tema}} e vi {{gancho}}. A {{negocio}} tem um programa de indicação com link individual. Posso te mandar como funciona?" },
    { name: "B · pergunta sobre audiência", template: "{{saudacao}}! Sou {{owner}}, da {{negocio}}. Seu público de {{tema}} bate com quem a gente atende. Você já indica alguma marca hoje? Se topar, te explico o programa em duas linhas." },
  ],
};

export function renderTemplate(template: string, vars: Record<string, string | null | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => (vars[key] ?? "").trim()).replace(/\s+([,.!?])/g, "$1").replace(/,\s*([,.!?])/g, "$1").replace(/[ \t]{2,}/g, " ").replace(/^[,\s]+/, "").trim();
}

export function ensureDefaultExperiments(database: AppDatabase): Record<"customer" | "affiliate", string> {
  const ids = {} as Record<"customer" | "affiliate", string>;
  for (const funnel of ["customer", "affiliate"] as const) {
    const existing = database.$client.prepare("SELECT id FROM experiments WHERE variable = 'opening_message' AND funnel = ?").get(funnel) as { id: string } | undefined;
    if (existing) { ids[funnel] = existing.id; continue; }
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    database.$client.prepare("INSERT INTO experiments (id, name, variable, funnel, status, created_at) VALUES (?, ?, 'opening_message', ?, 'running', ?)").run(id, funnel === "customer" ? "Mensagem de abertura · clientes" : "Mensagem de abertura · afiliados", funnel, now);
    for (const variant of DEFAULT_VARIANTS[funnel]) database.$client.prepare("INSERT INTO experiment_variants (id, experiment_id, name, template, weight, created_at) VALUES (?, ?, ?, ?, 1, ?)").run(crypto.randomUUID(), id, variant.name, variant.template, now);
    ids[funnel] = id;
  }
  return ids;
}

export function listExperiments(database: AppDatabase): ExperimentRow[] {
  return database.$client.prepare("SELECT * FROM experiments ORDER BY created_at ASC").all() as ExperimentRow[];
}

export function listVariants(database: AppDatabase, experimentId: string): VariantRow[] {
  return database.$client.prepare("SELECT * FROM experiment_variants WHERE experiment_id = ? ORDER BY created_at ASC").all(experimentId) as VariantRow[];
}

export function assignVariant(database: AppDatabase, input: { leadId: string; experimentId: string; rng?: () => number }): VariantRow {
  const assigned = database.$client.prepare("SELECT v.* FROM experiment_assignments a JOIN experiment_variants v ON v.id = a.variant_id WHERE a.lead_id = ? AND a.experiment_id = ?").get(input.leadId, input.experimentId) as VariantRow | undefined;
  if (assigned) return assigned;
  const variants = listVariants(database, input.experimentId);
  if (!variants.length) throw new Error("Experiment has no variants");
  const total = variants.reduce((sum, v) => sum + Math.max(v.weight, 0), 0) || variants.length;
  let pick = (input.rng ?? Math.random)() * total;
  let chosen = variants[variants.length - 1]!;
  for (const variant of variants) { pick -= Math.max(variant.weight, 0) || (total === variants.length ? 1 : 0); if (pick < 0) { chosen = variant; break; } }
  database.$client.prepare("INSERT OR IGNORE INTO experiment_assignments (lead_id, experiment_id, variant_id, created_at) VALUES (?, ?, ?, ?)").run(input.leadId, input.experimentId, chosen.id, new Date().toISOString());
  return chosen;
}

const INTERESTED = "('interested','meeting','whatsapp_handoff','registered','active_customer','joined_affiliate_group','active_affiliate','generated_customer','won')";
const HANDOFF = "('whatsapp_handoff','registered','active_customer','joined_affiliate_group','active_affiliate','generated_customer','won')";

export function variantMetrics(database: AppDatabase, experimentId: string): VariantMetrics[] {
  return (database.$client.prepare(`SELECT v.id AS variantId, v.name, v.weight,
    (SELECT count(DISTINCT m.lead_id) FROM messages m WHERE m.variant_id = v.id AND m.direction = 'out' AND m.sent_via <> 'dry_run') AS sent,
    (SELECT count(DISTINCT m.lead_id) FROM messages m JOIN leads l ON l.id = m.lead_id WHERE m.variant_id = v.id AND m.direction = 'out' AND m.sent_via <> 'dry_run' AND l.status IN ('replied','interested','meeting','whatsapp_handoff','registered','active_customer','joined_affiliate_group','active_affiliate','generated_customer','won')) AS replied,
    (SELECT count(DISTINCT m.lead_id) FROM messages m JOIN leads l ON l.id = m.lead_id WHERE m.variant_id = v.id AND m.direction = 'out' AND m.sent_via <> 'dry_run' AND l.status IN ${INTERESTED}) AS interested,
    (SELECT count(DISTINCT m.lead_id) FROM messages m JOIN leads l ON l.id = m.lead_id WHERE m.variant_id = v.id AND m.direction = 'out' AND m.sent_via <> 'dry_run' AND l.status IN ${HANDOFF}) AS handoff
    FROM experiment_variants v WHERE v.experiment_id = ? ORDER BY v.created_at ASC`).all(experimentId) as VariantMetrics[]);
}

// Score = weighted conversions per send; weights follow the score but never drop below the explore floor.
export function rebalanceWeights(metrics: VariantMetrics[], options: { minSample?: number; exploreFloor?: number } = {}): Map<string, number> {
  const minSample = options.minSample ?? 30, floor = options.exploreFloor ?? 0.2;
  const out = new Map(metrics.map((m) => [m.variantId, m.weight]));
  if (metrics.length < 2 || metrics.some((m) => m.sent < minSample)) return out;
  const scores = metrics.map((m) => (m.replied + 2 * m.interested + 3 * m.handoff) / m.sent);
  const total = scores.reduce((a, b) => a + b, 0);
  if (total === 0) return out;
  const shares = scores.map((s) => s / total);
  const below = shares.map((s, i) => (s < floor ? i : -1)).filter((i) => i >= 0);
  const remaining = 1 - floor * below.length;
  const aboveSum = shares.reduce((sum, s, i) => (below.includes(i) ? sum : sum + s), 0);
  metrics.forEach((m, i) => out.set(m.variantId, Number((below.includes(i) ? floor : (shares[i]! / aboveSum) * remaining).toFixed(3))));
  return out;
}

export function applyRebalance(database: AppDatabase, experimentId: string, options?: { minSample?: number; exploreFloor?: number }): VariantMetrics[] {
  const metrics = variantMetrics(database, experimentId);
  const weights = rebalanceWeights(metrics, options);
  for (const [variantId, weight] of weights) database.$client.prepare("UPDATE experiment_variants SET weight = ? WHERE id = ?").run(weight, variantId);
  return variantMetrics(database, experimentId);
}
