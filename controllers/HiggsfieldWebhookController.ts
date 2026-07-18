/**
 * HiggsfieldWebhookController — recibe callbacks asíncronos de Higgsfield para
 * cerrar jobs sin esperar al polling (spec §5).
 *
 *   POST /api/webhooks/higgsfield
 *
 * Verificación de firma: opcional vía HIGGSFIELD_WEBHOOK_VERIFY_SIGNATURE.
 * Como el esquema de firma real se confirmará con la doc del dashboard, la
 * verificación HMAC está centralizada aquí y es ajustable. Si no hay secreto
 * configurado, se acepta (mismo comportamiento tolerante que fal en dev).
 *
 * SIEMPRE responde 200 ante errores de procesamiento para que el proveedor no
 * reintente en bucle (la idempotencia de ResolveGenerationJobService protege).
 */

import crypto from "node:crypto";
import { Request, Response } from "express";
import logger from "../utils/logger";
import UGCVideoJob from "../models/UGCVideoJob";
import ResolveGenerationJobService from "../services/Generation/orchestrator/ResolveGenerationJobService";
import { mapJobSet } from "../services/UGCProviders/higgsfield/mapper";
import { resolveHiggsfieldConfig } from "../services/UGCProviders/higgsfield/HiggsfieldConfig";
import type {
  HiggsfieldWebhookPayload,
  HiggsfieldJobSet
} from "../services/UGCProviders/higgsfield/types";
import type {
  ProviderJob,
  ProviderJobOutput
} from "../services/Generation/types";

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Verifica la firma del webhook. AJUSTAR el header/esquema cuando llegue la
 * doc. Por defecto usa HMAC-SHA256(rawBody, secret) en hex contra el header
 * `x-higgsfield-signature`. Si no hay secreto, no bloquea.
 */
async function verifySignature(req: RawBodyRequest): Promise<boolean> {
  if (process.env.HIGGSFIELD_WEBHOOK_VERIFY_SIGNATURE === "false") {
    return true;
  }

  const config = await resolveHiggsfieldConfig(null);
  const secret =
    (config?.settings?.webhookSecret as string) ||
    process.env.HIGGSFIELD_WEBHOOK_SECRET ||
    "";

  if (!secret) {
    logger.warn(
      "[HiggsfieldWebhook] Sin webhook secret configurado — se acepta sin verificar"
    );
    return true;
  }

  const signature =
    req.header("x-higgsfield-signature") || req.header("x-hf-signature");
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), "utf8");

  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}

export const receive = async (req: RawBodyRequest, res: Response): Promise<Response> => {
  const ok = await verifySignature(req);
  if (!ok) {
    logger.warn("[HiggsfieldWebhook] Firma inválida");
    return res.status(401).json({ success: false, message: "Invalid signature" });
  }

  const payload = (req.body || {}) as HiggsfieldWebhookPayload;
  const providerJobId = payload.id || payload.request_id;

  if (!providerJobId) {
    return res.status(400).json({ success: false, message: "Missing job id" });
  }

  try {
    const job = await UGCVideoJob.findOne({
      where: { videoProviderJobId: String(providerJobId), provider: "higgsfield" }
    });

    if (!job) {
      logger.warn(
        `[HiggsfieldWebhook] No UGCVideoJob para request=${providerJobId}`
      );
      return res.status(200).json({ success: true, ignored: true });
    }

    if (job.status === "completed" || job.status === "failed") {
      return res.status(200).json({ success: true, duplicate: true });
    }

    // Normalizar el payload del webhook a ProviderJob.
    let providerJob: ProviderJob;
    if (Array.isArray(payload.jobs)) {
      // Forma job-set (v1): { id, jobs:[...] }.
      const jobSet: HiggsfieldJobSet = {
        id: String(providerJobId),
        jobs: payload.jobs
      };
      providerJob = mapJobSet(jobSet);
    } else {
      // Forma v2: { request_id, status, images:[{url}], video:{url} }.
      const outputs: ProviderJobOutput[] = [];
      if (payload.images?.length) {
        for (const img of payload.images) {
          if (img.url) outputs.push({ url: img.url, mediaType: "image", mimeType: "image/png" });
        }
      }
      if (payload.video?.url) {
        outputs.push({ url: payload.video.url, mediaType: "video", mimeType: "video/mp4" });
      }
      const status =
        payload.status === "completed"
          ? "succeeded"
          : payload.status === "failed" || payload.status === "nsfw"
          ? "failed"
          : payload.status === "in_progress"
          ? "processing"
          : "queued";
      providerJob = {
        providerJobId: String(providerJobId),
        status,
        outputs: outputs.length ? outputs : undefined,
        error: status === "failed" ? "Generación fallida (webhook)" : undefined,
        raw: payload
      };
    }

    const result = await ResolveGenerationJobService({
      videoJobId: job.id,
      providerJob
    });

    return res.status(200).json({ success: true, status: result.status });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      `[HiggsfieldWebhook] Error procesando request=${providerJobId}: ${message}`
    );
    // 200 para evitar reintentos en bucle del proveedor.
    return res.status(200).json({ success: true, acceptedWithProcessingError: true });
  }
};
