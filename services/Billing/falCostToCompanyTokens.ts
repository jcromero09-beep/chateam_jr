/**
 * Conversión de costo estimado de fal.ai (USD) a tokens internos de Company.
 *
 * Regla acordada con producto (2026-05-14):
 *   tokensToCharge = ceil(estimatedCostUsd * FAL_USD_TO_COMPANY_TOKENS)
 *
 * Notas:
 *   - 1 USD de fal.ai = 100 tokens internos (relación lineal directa).
 *   - SIEMPRE Math.ceil para que costos micro (p.ej. $0.04) descuenten al
 *     menos 1 token.
 *   - estimatedCostUsd === 0 → 0 tokens (no se descuenta ni refundea).
 *   - null/undefined/NaN/Infinity/negativo → throw (no descontar
 *     silenciosamente).
 *   - La constante FAL_USD_TO_COMPANY_TOKENS vive SOLO aquí. No hardcodear
 *     "100" en ningún otro archivo.
 */

import type { FalAdapter } from "../UGCProviders/fal/adapters/types";

/** Tasa de conversión 1 USD fal.ai → N tokens internos. */
export const FAL_USD_TO_COMPANY_TOKENS = 100;

/**
 * Convierte un costo estimado en USD a tokens internos de Company.
 *
 * @throws {Error} si el input es null/undefined/NaN/Infinity/negativo.
 */
export function falCostUsdToCompanyTokens(
  estimatedCostUsd: number | null | undefined
): number {
  if (estimatedCostUsd === null || estimatedCostUsd === undefined) {
    throw new Error(
      "[Billing] fal.ai estimatedCostUsd es null/undefined — no se puede convertir a tokens"
    );
  }
  if (typeof estimatedCostUsd !== "number" || !Number.isFinite(estimatedCostUsd)) {
    throw new Error(
      `[Billing] fal.ai estimatedCostUsd inválido (no es número finito): ${String(estimatedCostUsd)}`
    );
  }
  if (estimatedCostUsd < 0) {
    throw new Error(
      `[Billing] fal.ai estimatedCostUsd negativo: ${estimatedCostUsd}`
    );
  }
  if (estimatedCostUsd === 0) {
    return 0;
  }
  return Math.ceil(estimatedCostUsd * FAL_USD_TO_COMPANY_TOKENS);
}

/**
 * Mapping categoría del adapter → key de AICreditType existente en BD.
 *
 * Las keys deben coincidir con AICreditTypes.key (verificado en producción
 * 2026-05-14):
 *   - 'image'          → defaultCost 0.04
 *   - 'ugc_video'      → defaultCost 0.50
 *   - 'tts_character'  → defaultCost 0.000015
 *
 * Mantener este mapping aquí significa que el adapter NO necesita saber de
 * billing — solo conoce su categoría.
 */
const CATEGORY_TO_CREDIT_KEY = {
  "text-to-image": "image",
  "image-to-image": "image",
  "text-to-video": "ugc_video",
  "image-to-video": "ugc_video",
  "video-to-video": "ugc_video",
  "text-to-speech": "tts_character",
  lipsync: "ugc_video"
} as const;

export type SupportedCreditKey =
  (typeof CATEGORY_TO_CREDIT_KEY)[keyof typeof CATEGORY_TO_CREDIT_KEY];

/**
 * Devuelve el creditTypeKey adecuado para un adapter dado, según su
 * categoría. Si la categoría no tiene mapping, lanza error explícito —
 * no asumir defaults silenciosos.
 */
export function getCreditTypeKeyForAdapter(
  adapter: Pick<FalAdapter<unknown, unknown, unknown>, "category" | "key">
): SupportedCreditKey {
  const mapped = CATEGORY_TO_CREDIT_KEY[adapter.category];
  if (!mapped) {
    throw new Error(
      `[Billing] adapter '${adapter.key}' tiene categoría '${adapter.category}' ` +
        `sin mapping a creditTypeKey. Actualiza CATEGORY_TO_CREDIT_KEY.`
    );
  }
  return mapped;
}

/**
 * Shape estandarizado del bloque de billing que se persiste en
 * UGCVideoJob.metadata / UGCVideoAsset.metadata. Sirve como source-of-truth
 * de auditoría para reconciliación manual si fal.ai falla post-cobro.
 */
export interface FalBillingMetadata {
  provider: "fal";
  modelKey: string;
  modelId: string;
  estimatedCostUsd: number;
  tokenConversionRate: number; // siempre FAL_USD_TO_COMPANY_TOKENS
  tokensCharged: number;
  creditTypeKey: SupportedCreditKey;
  companyId: number;
  campaignId: number;
  videoJobId: number;
  step?: string;
  requestId?: string;
  chargedAt: string;
  refundedAt?: string;
  refundReason?: string;
}

/**
 * Construye el objeto de billing metadata para auditoría.
 * Centralizado para que job y submitWithAdapter no dupliquen el shape.
 */
export function buildFalBillingMetadata(opts: {
  adapter: Pick<FalAdapter<unknown, unknown, unknown>, "key" | "modelId" | "category">;
  estimatedCostUsd: number;
  tokensCharged: number;
  creditTypeKey: SupportedCreditKey;
  companyId: number;
  campaignId: number;
  videoJobId: number;
  step?: string;
  requestId?: string;
}): FalBillingMetadata {
  return {
    provider: "fal",
    modelKey: opts.adapter.key,
    modelId: opts.adapter.modelId,
    estimatedCostUsd: opts.estimatedCostUsd,
    tokenConversionRate: FAL_USD_TO_COMPANY_TOKENS,
    tokensCharged: opts.tokensCharged,
    creditTypeKey: opts.creditTypeKey,
    companyId: opts.companyId,
    campaignId: opts.campaignId,
    videoJobId: opts.videoJobId,
    step: opts.step,
    requestId: opts.requestId,
    chargedAt: new Date().toISOString()
  };
}
