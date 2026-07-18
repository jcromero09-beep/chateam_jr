import CompanyTokenUsage from "../../models/CompanyTokenUsage";
import Company from "../../models/Company";
import AiTokenTransaction from "../../models/AiTokenTransaction";
import sequelize from "../../database";
import { Sequelize } from "sequelize-typescript";
import {
  calculateTokenCostUsd,
  normalizePricingModel
} from "./AITokenPricingService";

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
 * Registra y cobra el uso de tokens de OpenAI.
 * Descuenta del saldo real de Company.aiTokenBalance, crea auditoria en
 * AiTokenTransactions y acumula el consumo mensual por compania/modelo.
 */
export const trackTokenUsage = async ({
  companyId,
  model,
  promptTokens,
  completionTokens,
  totalTokens,
  module
}: TrackTokensParams): Promise<void> => {
  const transaction = await sequelize.transaction();

  try {
    if (!companyId || !model || totalTokens <= 0) {
      await transaction.rollback();
      return; // No registrar si faltan datos o no hay tokens
    }

    const monthDate = getFirstDayOfMonth();
    const pricingModel = normalizePricingModel(model);
    const costUsd = calculateTokenCostUsd(model, promptTokens, completionTokens);

    const company = await Company.findByPk(companyId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    if (!company) {
      throw new Error(`ERR_COMPANY_NOT_FOUND: company=${companyId}`);
    }

    const currentBalance = Number(company.aiTokenBalance || 0);

    if (currentBalance < totalTokens) {
      throw new Error(
        `ERR_AI_INSUFFICIENT_TOKENS: company=${companyId} required=${totalTokens} available=${currentBalance}`
      );
    }

    const balanceAfter = currentBalance - totalTokens;

    await company.update(
      { aiTokenBalance: balanceAfter } as any,
      { transaction }
    );

    // Buscar registro existente para este companyId + model + month
    const existing = await CompanyTokenUsage.findOne({
      where: {
        companyId: companyId,
        model,
        month: monthDate
      },
      transaction
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
          },
          transaction
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
      } as any, { transaction });
    }

    await AiTokenTransaction.create({
      companyId,
      type: "usage",
      tokens: -Math.abs(totalTokens),
      amountUsd: costUsd,
      module,
      referenceId: model,
      meta: {
        model,
        pricingModel,
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd
      },
      balanceAfter,
      description: `Uso IA ${module}: ${totalTokens} tokens (${model})`
    } as any, { transaction });

    await transaction.commit();

    console.log(
      `[TokenTracking] ${module}: ${totalTokens} tokens (${model}) - $${costUsd.toFixed(6)} - balance ${currentBalance} -> ${balanceAfter}`
    );
  } catch (error) {
    // `finished` es una propiedad interna de Sequelize (no expuesta en el tipo).
    // Se setea a "commit" | "rollback" cuando la transacción ya terminó.
    // Casteamos a any para evitar TS2339 sin perder la verificación runtime.
    if (!(transaction as any).finished) {
      await transaction.rollback();
    }
    console.error("[TokenTracking] Error al registrar/cobrar tokens:", error);
    throw error;
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
  usage: { prompt_tokens?: number; total_tokens?: number } | number | undefined
): Promise<void> => {
  if (!usage) return;

  const promptTokens = typeof usage === "number" ? usage : usage.prompt_tokens || 0;
  const totalTokens = typeof usage === "number" ? usage : usage.total_tokens || 0;

  await trackTokenUsage({
    companyId,
    model,
    promptTokens,
    completionTokens: 0,
    totalTokens,
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
