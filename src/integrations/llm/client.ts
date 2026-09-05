import OpenAI from "openai";
import type { AppDatabase } from "@/db/client";
import { evidenceInterpretationSchema, type EvidenceInterpretation } from "@/integrations/llm/schemas";

interface InterpretationInput {
  leadName: string;
  evidence: Array<{ id: string; type: string; value: string; sourceUrl: string }>;
  verifiedClaims: string[];
}

type Transport = (input: InterpretationInput) => Promise<unknown>;

export interface InterpretationResult extends EvidenceInterpretation { available: boolean; model: string | null }

async function openAiTransport(input: InterpretationInput, apiKey: string, baseURL?: string, model?: string): Promise<unknown> {
  const client = new OpenAI({ apiKey, baseURL: baseURL || undefined });
  const response = await client.chat.completions.create({
    model: model || "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "Return JSON with whyThisLead, opportunity, personalizationHook, evidenceIds. Use only supplied evidence and verified claims. Never infer growth, results, clients, awards, guarantees, or facts not present." },
      { role: "user", content: JSON.stringify(input) },
    ],
  });
  return JSON.parse(response.choices[0]?.message.content ?? "{}");
}

export async function interpretEvidence(input: InterpretationInput, options: { apiKey?: string; baseUrl?: string; model?: string; transport?: Transport } = {}): Promise<InterpretationResult> {
  const apiKey = options.apiKey ?? process.env.LLM_API_KEY ?? "";
  if (!apiKey) {
    const first = input.evidence[0];
    const observed = first?.value ?? "evidência insuficiente";
    return { available: false, model: null, whyThisLead: first ? `Sinal observado: ${observed}.` : "Evidência insuficiente para explicar este lead.", opportunity: first ? `Vale investigar o contexto de ${observed}.` : "Evidência insuficiente para apontar uma oportunidade.", personalizationHook: first ? observed : "Sem personalização específica", evidenceIds: first ? [first.id] : [] };
  }
  const model = options.model ?? process.env.LLM_MODEL ?? "gpt-4.1-mini";
  const raw = options.transport ? await options.transport(input) : await openAiTransport(input, apiKey, options.baseUrl ?? process.env.LLM_BASE_URL, model);
  const parsed = evidenceInterpretationSchema.parse(raw);
  const allowedIds = new Set(input.evidence.map((item) => item.id));
  if (parsed.evidenceIds.some((id) => !allowedIds.has(id))) throw new Error("A resposta citou uma evidência desconhecida.");
  return { ...parsed, available: true, model };
}

export function recordAiCall(database: AppDatabase, input: { provider: string; model: string; purpose: string; leadId?: string; campaignId?: string; inputTokens: number; outputTokens: number; estimatedCost: number; latencyMs: number; status: string }) {
  database.$client.prepare("INSERT INTO ai_calls (id, provider, model, purpose, lead_id, campaign_id, input_tokens, output_tokens, estimated_cost, latency_ms, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(crypto.randomUUID(), input.provider, input.model, input.purpose, input.leadId ?? null, input.campaignId ?? null, input.inputTokens, input.outputTokens, input.estimatedCost, input.latencyMs, input.status, new Date().toISOString());
}

export function assertAiBudgetAvailable(database: AppDatabase, monthlyBudgetUsd = Number(process.env.LLM_MONTHLY_BUDGET_USD ?? 10)): void {
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const spent = (database.$client.prepare("SELECT COALESCE(sum(estimated_cost), 0) as total FROM ai_calls WHERE created_at >= ? AND status = 'completed'").get(start.toISOString()) as { total: number }).total;
  if (monthlyBudgetUsd > 0 && spent >= monthlyBudgetUsd) throw new Error("Orçamento mensal de IA atingido; somente as operações de IA foram pausadas.");
}
