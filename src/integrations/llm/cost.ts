const ratesPerMillionTokens: Record<string, { input: number; output: number }> = {
  default: { input: 1, output: 4 },
};

export function estimateLlmCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = ratesPerMillionTokens[model] ?? ratesPerMillionTokens.default;
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}
