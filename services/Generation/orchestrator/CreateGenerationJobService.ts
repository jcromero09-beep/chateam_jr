/**
 * CreateGenerationJobService — orquestador NEUTRAL de creación de jobs (spec §3/§5/§6).
 *
 * Pipeline:
 *   1. Validar el GenerationRequest (Yup) + moderación básica de prompt.
 *   2. Idempotencia: si ya existe un UGCVideoJob con (companyId, idempotencyKey)
 *      se devuelve ese — NO se duplica ni se vuelve a cobrar.
 *   3. Estimar costo → créditos (con markup).
 *   4. Reservar créditos (DeductCreditsService). Si falla → throw, no se llama
 *      al proveedor.
 *   5. Crear el job en el proveedor (no bloqueante). Si falla → refund + throw.
 *   6. Persistir UGCVideoJob (estado processing) en la MISMA tabla que UGC, con
 *      provider="higgsfield", campaña null y billing metadata para auditoría.
 *   7. Encolar el seguimiento (polling) por si no hay webhook.
 *
 * NO descarga el resultado aquí — eso lo hace ResolveGenerationJobService al
 * cerrarse el job (webhook o polling).
 */

import * as Yup from "yup";
import type { GenerationRequest, ProviderId } from "../types";
import { getProvider, resolveProviderForModel } from "../ProviderRegistry";
import EstimateCostService from "./EstimateCostService";
import DeductCreditsService from "../../AICreditServices/DeductCreditsService";
import RefundCreditsService from "../../AICreditServices/RefundCreditsService";
import { buildGenerationBillingMetadata } from "../../Billing/generationCostToCompanyTokens";
import { resolveHiggsfieldWebhookUrl } from "../../UGCProviders/higgsfield/HiggsfieldConfig";
import UGCVideoJob from "../../../models/UGCVideoJob";
import AppError from "../../../errors/AppError";
import logger from "../../../utils/logger";
import { add } from "../../../queues";

export interface CreateGenerationJobResult {
  jobId: number;
  status: string;
  providerJobId?: string;
  credits: number;
  reused: boolean;
}

interface CreateGenerationJobInput {
  req: GenerationRequest;
  providerId?: ProviderId;
}

const requestSchema = Yup.object().shape({
  tenantId: Yup.number().required().positive(),
  mediaType: Yup.string().oneOf(["image", "video"]).required(),
  modelId: Yup.string().required(),
  prompt: Yup.string().required().min(2).max(2000),
  idempotencyKey: Yup.string().required().min(6).max(120),
  count: Yup.number().min(1).max(4).optional()
});

function resolveMimeType(mediaType: string): string {
  return mediaType === "image" ? "image/png" : "video/mp4";
}

const CreateGenerationJobService = async ({
  req,
  providerId
}: CreateGenerationJobInput): Promise<CreateGenerationJobResult> => {
  // --- 1) Validación + moderación básica ---
  try {
    await requestSchema.validate(req, { abortEarly: false });
  } catch (err) {
    throw new AppError(
      `ERR_GENERATION_VALIDATION: ${(err as Yup.ValidationError).errors?.join("; ")}`,
      422
    );
  }

  // --- 2) Idempotencia ---
  const existing = await UGCVideoJob.findOne({
    where: { companyId: req.tenantId, idempotencyKey: req.idempotencyKey }
  });
  if (existing) {
    logger.info(
      `[CreateGenerationJob] idempotencyKey ya procesada — reutilizando job ${existing.id}`
    );
    return {
      jobId: existing.id,
      status: existing.status,
      providerJobId: existing.videoProviderJobId,
      credits: Number(existing.totalCreditsUsed) || 0,
      reused: true
    };
  }

  const provider = providerId
    ? getProvider(providerId)
    : await resolveProviderForModel(req.modelId, req.tenantId);

  // --- 3) Estimar costo → créditos ---
  const estimate = await EstimateCostService({ req, providerId: provider.id });

  // --- 4) Reservar créditos (antes de llamar al proveedor) ---
  if (estimate.credits > 0) {
    try {
      await DeductCreditsService({
        companyId: req.tenantId,
        creditTypeKey: estimate.creditTypeKey,
        amount: estimate.credits,
        description: `Generación ${provider.id} ${req.mediaType} [${req.modelId}]`,
        userId: req.userId,
        source: "generation_create_job",
        sourceId: req.idempotencyKey
      });
    } catch (err) {
      // Saldo insuficiente u otro error de créditos → propagar tal cual.
      logger.warn(
        `[CreateGenerationJob] cobro falló (no se llama al proveedor): ${String(err)}`
      );
      throw err;
    }
  }

  // --- 5) Crear job en el proveedor ---
  const webhookUrl = resolveHiggsfieldWebhookUrl() || undefined;
  let providerJob;
  try {
    providerJob = await provider.createJob(req, { webhookUrl });
  } catch (err) {
    // Refund automático si ya se cobró.
    if (estimate.credits > 0) {
      try {
        await RefundCreditsService({
          companyId: req.tenantId,
          creditTypeKey: estimate.creditTypeKey,
          amount: estimate.credits,
          description: `Refund: ${provider.id} createJob falló`,
          source: "generation_create_job_refund",
          sourceId: req.idempotencyKey
        });
      } catch (refundErr) {
        logger.error(
          `[CreateGenerationJob] refund FALLÓ tras error del proveedor. ` +
            `Reconciliar manual: credits=${estimate.credits} company=${req.tenantId}: ${String(refundErr)}`
        );
      }
    }
    if (err instanceof AppError) throw err;
    throw new AppError(
      `ERR_GENERATION_PROVIDER: ${String((err as Error)?.message || err)}`,
      502
    );
  }

  // --- 6) Persistir UGCVideoJob (misma tabla que UGC) ---
  const billing = buildGenerationBillingMetadata({
    provider: provider.id,
    req,
    providerCostUsd: estimate.providerCostUsd,
    markup: estimate.markup,
    creditsCharged: estimate.credits,
    creditTypeKey: estimate.creditTypeKey,
    requestId: providerJob.providerJobId
  });

  const videoJob = await UGCVideoJob.create({
    companyId: req.tenantId,
    ugcCampaignId: null,
    userId: req.userId || 0,
    stage: "video_generation",
    status: "processing",
    progress: 10,
    provider: provider.id,
    mediaType: req.mediaType,
    modelKey: req.modelId,
    styleId: req.styleId,
    idempotencyKey: req.idempotencyKey,
    promptText: req.prompt,
    videoProvider: provider.id,
    videoProviderJobId: providerJob.providerJobId,
    mimeType: resolveMimeType(req.mediaType),
    totalCreditsUsed: estimate.credits,
    totalCostUsd: estimate.providerCostUsd,
    metadata: {
      generationBilling: billing,
      generationRequest: {
        modelId: req.modelId,
        styleId: req.styleId,
        resolution: req.resolution,
        aspectRatio: req.aspectRatio,
        duration: req.duration,
        audio: req.audio,
        count: req.count
      }
    }
  } as Partial<UGCVideoJob> as UGCVideoJob);

  // --- 7) Encolar seguimiento (polling) — webhook lo cerrará antes si llega ---
  try {
    await add(
      "GenerationPollQueue",
      { videoJobId: videoJob.id, companyId: req.tenantId, attempt: 0 },
      { delay: 8000, removeOnComplete: true, removeOnFail: true }
    );
  } catch (err) {
    logger.warn(
      `[CreateGenerationJob] no se pudo encolar polling (¿Redis off?): ${String(err)}`
    );
  }

  return {
    jobId: videoJob.id,
    status: videoJob.status,
    providerJobId: providerJob.providerJobId,
    credits: estimate.credits,
    reused: false
  };
};

export default CreateGenerationJobService;
