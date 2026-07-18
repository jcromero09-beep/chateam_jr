/**
 * Conversión NEUTRAL de costo de proveedor (USD) a créditos internos de
 * Company, gemela de falCostToCompanyTokens.ts pero agnóstica de proveedor.
 *
 * Regla (alineada con fal, 2026-05-14):
 *   credits = ceil(costoProveedorUsd * markup * GENERATION_USD_TO_COMPANY_TOKENS)
 *
 * Notas:
 *   - 1 USD del proveedor = 100 créditos internos (relación lineal directa).
 *   - SIEMPRE Math.ceil para que costos micro descuenten al menos 1 crédito.
 *   - costo === 0 → 0 créditos (no se descuenta ni refundea).
 *   - null/undefined/NaN/Infinity/negativo → throw (no descontar en silencio).
 *   - La constante vive SOLO aquí; no hardcodear "100" en otros archivos.
 */

import type { GenerationRequest, MediaType } from "../Generation/types";

/** Tasa de conversión 1 USD proveedor → N créditos internos. */
export const GENERATION_USD_TO_COMPANY_TOKENS = 100;

/**
 * Convierte costo USD (ya con markup aplicado) a créditos internos.
 * @throws si el input es null/undefined/NaN/Infinity/negativo.
 */
export function generationCostUsdToCompanyTokens(
  costUsdWithMarkup: number | null | undefined
): number {
  if (costUsdWithMarkup === null || costUsdWithMarkup === undefined) {
    throw new Error(
      "[Billing] generation cost es null/undefined — no se puede convertir a créditos"
    );
  }
  if (typeof costUsdWithMarkup !== "number" || !Number.isFinite(costUsdWithMarkup)) {
    throw new Error(
      `[Billing] generation cost inválido (no finito): ${String(costUsdWithMarkup)}`
    );
  }
  if (costUsdWithMarkup < 0) {
    throw new Error(`[Billing] generation cost negativo: ${costUsdWithMarkup}`);
  }
  if (costUsdWithMarkup === 0) {
    return 0;
  }
  return Math.ceil(costUsdWithMarkup * GENERATION_USD_TO_COMPANY_TOKENS);
}

/**
 * Mapping mediaType → key de AICreditType existente en BD (verificado en
 * producción 2026-05-14):
 *   - 'image'         → defaultCost 0.04
 *   - 'ugc_video'     → defaultCost 0.50
 *
 * Coincide con el mapping de fal (image→image, video→ugc_video) para que
 * Higgsfield consuma de los MISMOS balances. No se crean tipos nuevos.
 */
const MEDIA_TYPE_TO_CREDIT_KEY: Record<MediaType, string> = {
  image: "image",
  video: "ugc_video"
};

/**
 * Devuelve el creditTypeKey para una solicitud de generación según su
 * mediaType. Si el provider expone `resolveCreditTypeKey`, ese tiene
 * prioridad (lo decide el orquestador).
 */
export function getCreditTypeKeyForMediaType(mediaType: MediaType): string {
  const mapped = MEDIA_TYPE_TO_CREDIT_KEY[mediaType];
  if (!mapped) {
    throw new Error(
      `[Billing] mediaType '${mediaType}' sin mapping a creditTypeKey.`
    );
  }
  return mapped;
}

/** Shape estandarizado del bloque de billing persistido en UGCVideoJob.metadata. */
export interface GenerationBillingMetadata {
  provider: string;
  modelId: string;
  styleId?: string;
  providerCostUsd: number;
  markup: number;
  costUsdWithMarkup: number;
  tokenConversionRate: number; // siempre GENERATION_USD_TO_COMPANY_TOKENS
  creditsCharged: number;
  creditTypeKey: string;
  companyId: number;
  videoJobId?: number;
  idempotencyKey: string;
  requestId?: string;
  chargedAt: string;
  refundedAt?: string;
  refundReason?: string;
}

export function buildGenerationBillingMetadata(opts: {
  provider: string;
  req: GenerationRequest;
  providerCostUsd: number;
  markup: number;
  creditsCharged: number;
  creditTypeKey: string;
  videoJobId?: number;
  requestId?: string;
}): GenerationBillingMetadata {
  return {
    provider: opts.provider,
    modelId: opts.req.modelId,
    styleId: opts.req.styleId,
    providerCostUsd: opts.providerCostUsd,
    markup: opts.markup,
    costUsdWithMarkup: opts.providerCostUsd * opts.markup,
    tokenConversionRate: GENERATION_USD_TO_COMPANY_TOKENS,
    creditsCharged: opts.creditsCharged,
    creditTypeKey: opts.creditTypeKey,
    companyId: opts.req.tenantId,
    videoJobId: opts.videoJobId,
    idempotencyKey: opts.req.idempotencyKey,
    requestId: opts.requestId,
    chargedAt: new Date().toISOString()
  };
}
