// Optional LLM for the conversation engine (OpenAI-compatible). Fast model classifies, main model
// drafts; every call is budget-checked and accounted in ai_calls. Without LLM_API_KEY this returns null.
import OpenAI from "openai";
import type { AppDatabase } from "@/db/client";
import type { BusinessProfile } from "@/features/business/schema";
import { intents, type Action, type Intent, type LlmConversation } from "@/features/conversations/engine";
import { assertAiBudgetAvailable, recordAiCall } from "@/integrations/llm/client";
import { estimateLlmCost } from "@/integrations/llm/cost";

export function createLlmConversation(database: AppDatabase, options: { leadId: string; apiKey?: string; baseUrl?: string; model?: string; fastModel?: string } ): LlmConversation | null {
  const apiKey = options.apiKey ?? process.env.LLM_API_KEY ?? "";
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey, baseURL: options.baseUrl ?? process.env.LLM_BASE_URL ?? undefined });
  const model = options.model ?? process.env.LLM_MODEL ?? "gpt-4.1-mini";
  const fastModel = options.fastModel ?? process.env.LLM_FAST_MODEL ?? model;

  async function call(purpose: string, useModel: string, system: string, user: unknown): Promise<Record<string, unknown>> {
    assertAiBudgetAvailable(database);
    const started = Date.now();
    try {
      const response = await client.chat.completions.create({ model: useModel, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(user) }] });
      const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
      recordAiCall(database, { provider: "openai-compatible", model: useModel, purpose, leadId: options.leadId, inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0, estimatedCost: estimateLlmCost(useModel, usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0), latencyMs: Date.now() - started, status: "completed" });
      return JSON.parse(response.choices[0]?.message.content ?? "{}") as Record<string, unknown>;
    } catch (error) {
      recordAiCall(database, { provider: "openai-compatible", model: useModel, purpose, leadId: options.leadId, inputTokens: 0, outputTokens: 0, estimatedCost: 0, latencyMs: Date.now() - started, status: "failed" });
      throw error;
    }
  }

  return {
    async classify({ text, history }): Promise<Intent> {
      const data = await call("classify_intent", fastModel, `Classify the lead's last message into exactly one intent from: ${intents.join(", ")}. Return JSON {"intent": "..."}. Portuguese and English. If the message asks to stop, it is opt_out. If unclear, ambiguous.`, { text, history: history.slice(-8) });
      const intent = String(data.intent ?? "");
      return (intents as readonly string[]).includes(intent) ? (intent as Intent) : "ambiguous";
    },
    async compose({ action, text, history, business, leadName }: { action: Action; text: string; history: string[]; business: BusinessProfile; leadName: string }): Promise<string> {
      const data = await call("compose_reply", model, `You are ${business.ownerName ?? business.businessName} replying on Instagram DM in ${business.outreachLanguage}. Tone: ${business.tone}. Write ONE short reply (max 3 sentences) that performs the action "${action}". Use ONLY these verified facts: ${JSON.stringify(business.verifiedClaims)}; pitch: ${business.oneLinePitch}; offer: ${business.offer}; how it works: ${business.howItWorks ?? ""}; WhatsApp link: ${business.whatsappLink ?? ""}; affiliate group: ${business.affiliateGroupLink ?? ""}. Never state anything from: ${JSON.stringify([...business.forbiddenClaims, ...business.unverifiedClaims])}. Never invent prices, guarantees, results or relationships. Return JSON {"reply": "..."}.`, { leadName, lastMessage: text, history: history.slice(-8) });
      return String(data.reply ?? "").trim();
    },
  };
}
