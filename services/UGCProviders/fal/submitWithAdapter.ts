/**
 * Helper para enviar un job a fal.ai usando un adapter del registry.
 *
 * Bypassa el `mapInput` genérico de FalClient (que no conoce los matices
 * de cada modelo) y envía un payload ya mapeado por el adapter
 * correspondiente. FalClient.ts queda intacto — este helper es la
 * única dependencia nueva que toca @fal-ai/client directamente.
 *
 * Cobro (PR #3, 2026-05-14):
 *   - Antes de fal.queue.submit, descuenta tokens internos a la company
 *     usando DeductCreditsService (creditTypeKey resuelto por categoría).
 *   - Si el submit falla, refundea automático vía RefundCreditsService.
 *   - tokensToCharge === 0 → no descuenta ni refundea.
 *
 * Devuelve { requestId, modelId, estimatedCostUsd, mappedInput, billing }
 * para que el caller persista billing metadata en UGCVideoJob.metadata.
 */

import { fal } from "@fal-ai/client";
import { ZodError } from "zod";
import logger from "../../../utils/logger";
import { resolveFalConfig } from "./FalConfig";
import { getAdapter } from "./adapters/registry";
import { FalProviderError } from "./errors";
import DeductCreditsService from "../../AICreditServices/DeductCreditsService";
import RefundCreditsService from "../../AICreditServices/RefundCreditsService";
import {
  buildFalBillingMetadata,
  falCostUsdToCompanyTokens,
  getCreditTypeKeyForAdapter,
  type FalBillingMetadata
} from "../../Billing/falCostToCompanyTokens";

export interface SubmitWithAdapterInput {
  /** key del adapter (= UGCCampaign.videoModelKey / imageModelKey) */
  adapterKey: string;
  /** Defaults persistidos en UGCCampaign.{video,image}ModelDefaults */
  campaignDefaults: Record<string, unknown> | null | undefined;
  /** Inputs de runtime resueltos por el pipeline (prompt, image_url, etc.) */
  runtimeInputs: Record<string, unknown>;
  /** companyId para resolver credenciales desde AIProviderConfig */
  companyId: number;
  /** webhookUrl público de fal para callback async */
  webhookUrl?: string;
  /** Prioridad de cola (default "normal") */
  priority?: "normal" | "low";
  /** Contexto opcional para billing/auditoría. Si no se provee, se
   *  registra con campaignId=0/videoJobId=0 (caller debe rellenar). */
  campaignId?: number;
  videoJobId?: number;
  /** Etiqueta del paso para auditoría (image|video|voice|lipsync|adhoc) */
  step?: string;
}

export interface SubmitWithAdapterOutput {
  requestId: string;
  modelId: string;
  modelKey: string;
  estimatedCostUsd: number;
  mappedInput: Record<string, unknown>;
  /** Billing metadata para persistir en UGCVideoJob/UGCVideoAsset. */
  billing: FalBillingMetadata;
}

async function ensureCredentials(companyId: number): Promise<void> {
  const config = await resolveFalConfig(companyId);
  if (!config?.apiKey) {
    throw new FalProviderError(
      "Fal.ai API key is not configured for company",
      "validation",
      500
    );
  }
  fal.config({ credentials: config.apiKey });
}

/**
 * Envía un job a fal.ai pasando por el adapter correspondiente.
 *
 * Pipeline:
 *   1. Resolver adapter por key (throw si no existe).
 *   2. Combinar defaults de campaña + runtime inputs.
 *   3. Validar con runtimeSchema (throw 422-friendly con ZodError).
 *   4. Estimar costo USD + convertir a tokens internos.
 *   5. Cobrar tokens a la company (si tokens > 0).
 *   6. fal.config con credenciales de la company.
 *   7. fal.queue.submit con webhookUrl + priority.
 *   8. Si falla → refund automático.
 */
export async function submitWithAdapter(
  input: SubmitWithAdapterInput
): Promise<SubmitWithAdapterOutput> {
  const adapter = getAdapter(input.adapterKey);

  // Merge: defaults primero, runtime sobrescribe.
  const merged = {
    ...(input.campaignDefaults || {}),
    ...input.runtimeInputs
  };

  let validated: unknown;
  try {
    validated = adapter.runtimeSchema.parse(merged);
  } catch (err) {
    if (err instanceof ZodError) {
      const detail = err.issues
        .map(i => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new Error(
        `[submitWithAdapter] validación runtime falló para '${input.adapterKey}': ${detail}`
      );
    }
    throw err;
  }

  const estimatedCostUsd = adapter.estimateCostUsd(validated);
  const mappedInput = adapter.mapInput(validated);
  const tokensToCharge = falCostUsdToCompanyTokens(estimatedCostUsd);
  const creditTypeKey = getCreditTypeKeyForAdapter(adapter);
  const stepLabel = input.step ?? "adhoc";

  const billing: FalBillingMetadata = buildFalBillingMetadata({
    adapter,
    estimatedCostUsd,
    tokensCharged: tokensToCharge,
    creditTypeKey,
    companyId: input.companyId,
    campaignId: input.campaignId ?? 0,
    videoJobId: input.videoJobId ?? 0,
    step: stepLabel
  });

  // --- Cobro ANTES del submit ---
  if (tokensToCharge > 0) {
    try {
      await DeductCreditsService({
        companyId: input.companyId,
        creditTypeKey,
        amount: tokensToCharge,
        description: `fal.ai ${stepLabel} [${adapter.key}] ($${estimatedCostUsd.toFixed(3)})`,
        source: "fal_submit_with_adapter",
        sourceId: `${input.videoJobId ?? "ad-hoc"}:${stepLabel}`
      });
      logger.info(
        `[submitWithAdapter] charged ${tokensToCharge} tokens (${creditTypeKey}) ` +
          `company=${input.companyId} estUsd=${estimatedCostUsd}`
      );
    } catch (err) {
      logger.warn(
        `[submitWithAdapter] cobro falló — NO se llama a fal. ` +
          `company=${input.companyId} tokens=${tokensToCharge}: ${String(err)}`
      );
      throw err;
    }
  }

  await ensureCredentials(input.companyId);

  logger.info(
    `[submitWithAdapter] submit company=${input.companyId} key=${input.adapterKey} ` +
      `model=${adapter.modelId} estimatedCostUsd=${estimatedCostUsd}`
  );

  // --- Submit a fal.ai ---
  let status;
  try {
    status = await fal.queue.submit(adapter.modelId, {
      input: mappedInput,
      webhookUrl: input.webhookUrl,
      priority: input.priority ?? "normal"
    });
  } catch (falErr) {
    // --- Refund automático ---
    if (tokensToCharge > 0) {
      try {
        await RefundCreditsService({
          companyId: input.companyId,
          creditTypeKey,
          amount: tokensToCharge,
          description: `Refund fal.ai ${stepLabel} failed: ${String(falErr).slice(0, 180)}`,
          source: "fal_submit_with_adapter_refund",
          sourceId: `${input.videoJobId ?? "ad-hoc"}:${stepLabel}`
        });
        billing.refundedAt = new Date().toISOString();
        billing.refundReason = String(falErr).slice(0, 180);
        logger.warn(
          `[submitWithAdapter] refund OK por fal-error: ${tokensToCharge} tokens`
        );
      } catch (refundErr) {
        logger.error(
          `[submitWithAdapter] refund FALLÓ tras fal-error. ` +
            `Reconciliar manual: tokens=${tokensToCharge} company=${input.companyId}: ${String(refundErr)}`
        );
      }
    }
    throw falErr;
  }

  logger.info(
    `[submitWithAdapter] submitted requestId=${status.request_id} model=${adapter.modelId}`
  );
  billing.requestId = status.request_id;

  return {
    requestId: status.request_id,
    modelId: adapter.modelId,
    modelKey: input.adapterKey,
    estimatedCostUsd,
    mappedInput,
    billing
  };
}

export default submitWithAdapter;
