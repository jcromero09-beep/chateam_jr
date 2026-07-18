/**
 * ResolveGenerationJobService — finalizador IDEMPOTENTE de un job de
 * generación (spec §5). Lo invocan tanto el webhook como el worker de polling.
 *
 * Comportamiento:
 *   - Si el job ya está completed/failed → no hace nada (idempotente).
 *   - Si el proveedor reporta succeeded → crea UGCVideoAsset(s) con las URLs de
 *     salida, actualiza el UGCVideoJob y lo marca completed.
 *   - Si reporta failed → marca failed y REFUNDEA los créditos reservados.
 *   - Si sigue en proceso → actualiza progreso y devuelve settled:false para
 *     que el polling reintente.
 *
 * Reusa los modelos UGCVideoJob/UGCVideoAsset (misma tabla que UGC) para que
 * los resultados aparezcan automáticamente en /ugc/video-studio.
 */

import type { ProviderJob } from "../types";
import { getProvider } from "../ProviderRegistry";
import RefundCreditsService from "../../AICreditServices/RefundCreditsService";
import UGCVideoJob from "../../../models/UGCVideoJob";
import UGCVideoAsset from "../../../models/UGCVideoAsset";
import logger from "../../../utils/logger";
import type { ProviderId } from "../types";
import type { GenerationBillingMetadata } from "../../Billing/generationCostToCompanyTokens";

export interface ResolveResult {
  settled: boolean;
  status: string;
}

interface ResolveInput {
  videoJobId: number;
  /** Si el webhook ya trae el ProviderJob, se evita un getJob extra. */
  providerJob?: ProviderJob;
}

function emitSocket(companyId: number, action: string, job: UGCVideoJob): void {
  try {
    // Lazy require: el worker puede no tener Socket.IO inicializado.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getIO } = require("../../../libs/socket");
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-generation`, {
      action,
      job: {
        id: job.id,
        status: job.status,
        stage: job.stage,
        progress: job.progress,
        provider: job.provider,
        mediaType: job.mediaType,
        finalVideoUrl: job.finalVideoUrl,
        thumbnailUrl: job.thumbnailUrl
      }
    });
  } catch {
    /* sin socket en este proceso — no-op */
  }
}

async function refundIfNeeded(job: UGCVideoJob, reason: string): Promise<void> {
  const metadata = (job.metadata || {}) as Record<string, unknown>;
  const billing = metadata.generationBilling as
    | GenerationBillingMetadata
    | undefined;

  if (!billing || billing.refundedAt || !billing.creditsCharged) {
    return;
  }

  try {
    await RefundCreditsService({
      companyId: job.companyId,
      creditTypeKey: billing.creditTypeKey,
      amount: billing.creditsCharged,
      description: `Refund generación ${billing.provider}: ${reason}`.slice(0, 200),
      source: "generation_resolve_refund",
      sourceId: billing.idempotencyKey
    });

    billing.refundedAt = new Date().toISOString();
    billing.refundReason = reason.slice(0, 200);
    await job.update({
      metadata: { ...metadata, generationBilling: billing }
    });
    logger.warn(
      `[ResolveGenerationJob] refund OK job=${job.id} credits=${billing.creditsCharged}`
    );
  } catch (err) {
    logger.error(
      `[ResolveGenerationJob] refund FALLÓ job=${job.id} — reconciliar manual: ${String(err)}`
    );
  }
}

const ResolveGenerationJobService = async ({
  videoJobId,
  providerJob
}: ResolveInput): Promise<ResolveResult> => {
  const job = await UGCVideoJob.findByPk(videoJobId);
  if (!job) {
    return { settled: true, status: "not_found" };
  }

  // Idempotencia: ya cerrado.
  if (job.status === "completed" || job.status === "failed") {
    return { settled: true, status: job.status };
  }

  // Resolver el estado del proveedor si no vino del webhook.
  let pj = providerJob;
  if (!pj) {
    if (!job.videoProviderJobId || !job.provider) {
      await job.markAsFailed("Job sin providerJobId/provider — no se puede resolver");
      emitSocket(job.companyId, "update", job);
      await refundIfNeeded(job, "Job sin providerJobId");
      return { settled: true, status: "failed" };
    }
    const provider = getProvider(job.provider as ProviderId);
    pj = await provider.getJob(job.videoProviderJobId, job.companyId);
  }

  // --- Fallo ---
  if (pj.status === "failed") {
    await job.update({
      metadata: {
        ...(job.metadata || {}),
        providerError: pj.error,
        providerRaw: pj.raw
      }
    });
    await job.markAsFailed(pj.error || "El proveedor reportó error");
    await refundIfNeeded(job, pj.error || "provider failed");
    emitSocket(job.companyId, "update", job);
    return { settled: true, status: "failed" };
  }

  // --- Éxito ---
  if (pj.status === "succeeded") {
    const outputs = pj.outputs || [];
    if (!outputs.length) {
      await job.markAsFailed("El proveedor reportó éxito sin outputs");
      await refundIfNeeded(job, "succeeded without outputs");
      emitSocket(job.companyId, "update", job);
      return { settled: true, status: "failed" };
    }

    let firstUrl: string | undefined;
    let firstThumb: string | undefined;
    let version = 1;

    for (const out of outputs) {
      const isImage = out.mediaType === "image";
      const assetType = isImage ? "generated_image" : "raw_video";
      const mimeType =
        out.mimeType || (isImage ? "image/png" : "video/mp4");

      // Evitar duplicar el mismo asset (idempotencia ante reintentos).
      const exists = await UGCVideoAsset.findOne({
        where: {
          ugcVideoJobId: job.id,
          originalUrl: out.url,
          isActive: true
        }
      });
      if (!exists) {
        await UGCVideoAsset.create({
          companyId: job.companyId,
          ugcVideoJobId: job.id,
          ugcCampaignId: job.ugcCampaignId || null,
          assetType,
          fileName: `${job.provider}_${job.mediaType}_${job.id}_${version}.${
            isImage ? "png" : "mp4"
          }`,
          localPath: out.url,
          originalUrl: out.url,
          fileSize: 0,
          mimeType,
          duration: out.durationSeconds || job.duration || null,
          version,
          isActive: true,
          downloadCount: 0,
          metadata: {
            provider: job.provider,
            requestId: job.videoProviderJobId,
            externalUrl: out.url,
            prompt: job.promptText,
            styleId: job.styleId,
            width: out.width,
            height: out.height
          }
        } as Partial<UGCVideoAsset> as UGCVideoAsset);
      }

      if (!firstUrl) {
        firstUrl = out.url;
        firstThumb = out.thumbnailUrl || out.url;
      }
      version += 1;
    }

    await job.update({
      rawVideoUrl: firstUrl,
      finalVideoUrl: firstUrl,
      thumbnailUrl: job.thumbnailUrl || firstThumb,
      progress: 100,
      metadata: {
        ...(job.metadata || {}),
        providerStatus: "succeeded",
        providerCostUsd: pj.costUsd,
        resolvedAt: new Date().toISOString()
      }
    });
    await job.markAsCompleted();
    emitSocket(job.companyId, "update", job);
    return { settled: true, status: "completed" };
  }

  // --- Sigue en proceso ---
  const progress = job.progress < 90 ? job.progress + 10 : 90;
  await job.updateProgress(progress);
  return { settled: false, status: pj.status };
};

export default ResolveGenerationJobService;
