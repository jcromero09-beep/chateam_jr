export interface TokenPricing {
  input: number;
  output: number;
}

// USD por 1M tokens. Mantener esta tabla alineada con el proveedor contratado.
const PRICING: Record<string, TokenPricing> = {
  "gpt-5.5": { input: 5.0, output: 30.0 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-3.5-turbo-0125": { input: 0.5, output: 1.5 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-4": { input: 30.0, output: 60.0 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
  "text-embedding-ada-002": { input: 0.1, output: 0 },
  "whisper-1": { input: 0.006, output: 0 }
};

const MODEL_FAMILIES = Object.keys(PRICING).sort((a, b) => b.length - a.length);

export const normalizePricingModel = (model?: string | null): string => {
  const clean = String(model || "").trim();
  if (PRICING[clean]) return clean;

  return MODEL_FAMILIES.find(
    family => clean === family || clean.startsWith(`${family}-`)
  ) || clean;
};

export const getTokenPricing = (model?: string | null): TokenPricing | null => {
  const normalized = normalizePricingModel(model);
  return PRICING[normalized] || null;
};

export const calculateTokenCostUsd = (
  model: string | null | undefined,
  promptTokens: number,
  completionTokens: number
): number => {
  const pricing = getTokenPricing(model);
  if (!pricing) return 0;

  return (
    (Math.max(0, Number(promptTokens) || 0) * pricing.input) / 1_000_000 +
    (Math.max(0, Number(completionTokens) || 0) * pricing.output) / 1_000_000
  );
};

export default {
  normalizePricingModel,
  getTokenPricing,
  calculateTokenCostUsd
};
