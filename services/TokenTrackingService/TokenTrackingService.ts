import CompanyTokenUsage from "../../models/CompanyTokenUsage";
import { Sequelize } from "sequelize-typescript";
import { Op } from "sequelize";

// Precios por 1M tokens (Diciembre 2024 - Actualizar segun OpenAI pricing)
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-3.5-turbo-0125": { input: 0.50, output: 1.50 },
  "gpt-3.5-turbo": { input: 0.50, output: 1.50 },
  "gpt-4-turbo": { input: 10.00, output: 30.00 },
  "gpt-4": { input: 30.00, output: 60.00 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
  "text-embedding-ada-002": { input: 0.10, output: 0 },
  "whisper-1": { input: 0.006, output: 0 }, // $0.006 por minuto de audio
};

export interface TrackTokensParams {
  companyId: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  module: 'chat' | 'followup' | 'classification' | 'embedding' | 'whisper' | 'transfer' | 'file_processing';
}

/**
 * Obtiene el primer dia del mes actual como Date
 */
const getFirstDayOfMonth = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

/**
 * Registra el uso de tokens de OpenAI en la base de datos.
 * Acumula tokens por compania, modelo y mes.
 */
export const trackTokenUsage = async ({
  companyId,
  model,
  promptTokens,
  completionTokens,
  totalTokens,
  module
}: TrackTokensParams): Promise<void> => {
  try {
    if (!companyId || !model || totalTokens <= 0) {
      return; // No registrar si faltan datos o no hay tokens
    }

    const monthDate = getFirstDayOfMonth();
    const pricing = PRICING[model] || { input: 0, output: 0 };

    // Calcular costo en USD
    const costUsd = (promptTokens * pricing.input / 1_000_000) +
                   (completionTokens * pricing.output / 1_000_000);

    // Buscar registro existente para este companyId + model + month
    const existing = await CompanyTokenUsage.findOne({
      where: {
        companyId: companyId,
        model,
        month: monthDate
      }
    });

    if (existing) {
      // SUMAR a los valores existentes (no reemplazar)
      await CompanyTokenUsage.update(
        {
          tokensMonth: Sequelize.literal(`"tokensMonth" + ${totalTokens}`),
          tokensTotal: Sequelize.literal(`"tokensTotal" + ${totalTokens}`),
          costUsdMonth: Sequelize.literal(`"costUsdMonth" + ${costUsd}`),
          costUsdTotal: Sequelize.literal(`"costUsdTotal" + ${costUsd}`)
        },
        {
          where: {
            companyId: companyId,
            model,
            month: monthDate
          }
        }
      );
    } else {
      // Crear nuevo registro
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      await CompanyTokenUsage.create({
        companyId: companyId,
        date: today,
        model,
        month: monthDate,
        tokensMonth: totalTokens,
        tokensTotal: totalTokens,
        costUsdMonth: costUsd,
        costUsdTotal: costUsd
      } as any);
    }

    console.log(`[TokenTracking] ${module}: ${totalTokens} tokens (${model}) - $${costUsd.toFixed(6)}`);
  } catch (error) {
    console.error("[TokenTracking] Error al registrar tokens:", error);
    // No lanzar error para no interrumpir el flujo principal
  }
};

/**
 * Registra uso de tokens desde una respuesta de OpenAI chat completion.
 */
export const trackChatCompletion = async (
  companyId: number,
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined,
  module: TrackTokensParams['module'] = 'chat'
): Promise<void> => {
  if (!usage) return;

  await trackTokenUsage({
    companyId,
    model,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    module
  });
};

/**
 * Registra uso de tokens desde una respuesta de OpenAI embeddings.
 */
export const trackEmbeddings = async (
  companyId: number,
  model: string,
  usage: { prompt_tokens?: number; total_tokens?: number } | undefined
): Promise<void> => {
  if (!usage) return;

  await trackTokenUsage({
    companyId,
    model,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: 0,
    totalTokens: usage.total_tokens || 0,
    module: 'embedding'
  });
};

/**
 * Registra uso de Whisper (transcripcion de audio).
 * Whisper cobra por segundo de audio, no por tokens.
 * Usamos total_tokens como aproximacion del costo.
 */
export const trackWhisper = async (
  companyId: number,
  durationSeconds: number
): Promise<void> => {
  // Whisper cobra $0.006 por minuto = $0.0001 por segundo
  // Simulamos como "tokens" para mantener consistencia
  const approximateTokens = Math.ceil(durationSeconds * 10); // ~10 "tokens" por segundo

  await trackTokenUsage({
    companyId,
    model: "whisper-1",
    promptTokens: approximateTokens,
    completionTokens: 0,
    totalTokens: approximateTokens,
    module: 'whisper'
  });
};

export default {
  trackTokenUsage,
  trackChatCompletion,
  trackEmbeddings,
  trackWhisper
};
