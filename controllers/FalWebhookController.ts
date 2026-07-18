import crypto from "node:crypto";
import axios from "axios";
import sodium from "libsodium-wrappers";
import { Request, Response } from "express";
import UGCVideoJob from "../models/UGCVideoJob";
import UGCVideoAsset from "../models/UGCVideoAsset";
import logger from "../utils/logger";
import { FalWebhookPayload, FalVideoOutput } from "../services/UGCProviders/fal/types";
import { FalWebhookSignatureError } from "../services/UGCProviders/fal/errors";

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

interface JwksKey {
  x: string;
}

let jwksCache: { keys: JwksKey[]; fetchedAt: number } | null = null;
const JWKS_URL = "https://rest.fal.ai/.well-known/jwks.json";
const JWKS_CACHE_MS = 24 * 60 * 60 * 1000;
const WEBHOOK_LEEWAY_SECONDS = 300;

function getHeader(req: Request, name: string): string | null {
  const value = req.header(name);
  return value && value.trim() ? value.trim() : null;
}

async function getJwksKeys(): Promise<JwksKey[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_MS) {
    return jwksCache.keys;
  }

  const response = await axios.get<{ keys: JwksKey[] }>(JWKS_URL, { timeout: 10_000 });
  jwksCache = {
    keys: response.data.keys || [],
    fetchedAt: now
  };

  return jwksCache.keys;
}

function base64UrlToBuffer(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

async function verifyFalWebhookSignature(req: RawBodyRequest): Promise<void> {
  if (process.env.FAL_WEBHOOK_VERIFY_SIGNATURE === "false") {
    logger.warn("[FalWebhookController] Signature verification disabled via FAL_WEBHOOK_VERIFY_SIGNATURE=false");
    return;
  }

  const requestId = getHeader(req, "x-fal-webhook-request-id");
  const userId = getHeader(req, "x-fal-webhook-user-id");
  const timestamp = getHeader(req, "x-fal-webhook-timestamp");
  const signatureHex = getHeader(req, "x-fal-webhook-signature");
  const rawBody = req.rawBody;

  if (!requestId || !userId || !timestamp || !signatureHex || !rawBody) {
    throw new FalWebhookSignatureError("Missing fal.ai webhook signature headers or raw body");
  }

  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > WEBHOOK_LEEWAY_SECONDS) {
    throw new FalWebhookSignatureError("fal.ai webhook timestamp outside allowed leeway");
  }

  const bodyHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const message = Buffer.from([requestId, userId, timestamp, bodyHash].join("\n"), "utf8");
  const signature = Buffer.from(signatureHex, "hex");
  const keys = await getJwksKeys();

  await sodium.ready;

  for (const key of keys) {
    const publicKey = base64UrlToBuffer(key.x);
    if (sodium.crypto_sign_verify_detached(signature, message, publicKey)) {
      return;
    }
  }

  throw new FalWebhookSignatureError();
}

function getVideoUrl(payload?: FalVideoOutput | Record<string, unknown>): string | null {
  const video = (payload as FalVideoOutput | undefined)?.video;
  if (video?.url) return video.url;

  const output = payload as Record<string, unknown> | undefined;
  const maybeVideo = output?.video as Record<string, unknown> | undefined;
  const maybeImages = output?.images as Array<Record<string, unknown>> | undefined;
  return String(maybeVideo?.url || maybeImages?.[0]?.url || "") || null;
}

export const receive = async (req: RawBodyRequest, res: Response): Promise<Response> => {
  try {
    await verifyFalWebhookSignature(req);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[FalWebhookController] Invalid signature: ${message}`);
    return res.status(401).json({ success: false, message: "Invalid fal.ai webhook signature" });
  }

  const payload = req.body as FalWebhookPayload<FalVideoOutput | Record<string, unknown>>;
  const requestId = payload.request_id || payload.gateway_request_id;

  if (!requestId) {
    return res.status(400).json({ success: false, message: "Missing fal request_id" });
  }

  try {
    const videoJob = await UGCVideoJob.findOne({
      where: { videoProviderJobId: requestId }
    });

    if (!videoJob) {
      logger.warn(`[FalWebhookController] No UGCVideoJob found for request=${requestId}`);
      return res.status(200).json({ success: true, ignored: true });
    }

    if (videoJob.status === "completed" || videoJob.status === "failed") {
      logger.info(`[FalWebhookController] Duplicate webhook ignored for request=${requestId}`);
      return res.status(200).json({ success: true, duplicate: true });
    }

    if (payload.status === "ERROR") {
      await videoJob.update({
        status: "failed",
        stage: "failed",
        errorMessage: payload.error || "fal.ai webhook returned ERROR",
        metadata: {
          ...(videoJob.metadata || {}),
          falStatus: "ERROR",
          falError: payload.error,
          falErrorType: payload.error_type,
          falWebhookAt: new Date().toISOString()
        }
      });

      return res.status(200).json({ success: true });
    }

    const outputUrl = getVideoUrl(payload.payload);
    if (!outputUrl) {
      await videoJob.markAsFailed("fal.ai webhook OK without output URL");
      return res.status(200).json({ success: true, missingOutput: true });
    }

    const existingAsset = await UGCVideoAsset.findOne({
      where: {
        ugcVideoJobId: videoJob.id,
        originalUrl: outputUrl,
        isActive: true
      }
    });

    if (!existingAsset) {
      await UGCVideoAsset.create({
        companyId: videoJob.companyId,
        ugcVideoJobId: videoJob.id,
        ugcCampaignId: videoJob.ugcCampaignId,
        assetType: "raw_video",
        fileName: `fal_video_${videoJob.ugcCampaignId}_${videoJob.id}.mp4`,
        localPath: outputUrl,
        originalUrl: outputUrl,
        fileSize: 0,
        mimeType: "video/mp4",
        duration: videoJob.duration || null,
        version: 1,
        isActive: true,
        downloadCount: 0,
        metadata: {
          provider: "fal",
          requestId,
          gatewayRequestId: payload.gateway_request_id,
          externalUrl: outputUrl
        }
      } as Partial<UGCVideoAsset> as UGCVideoAsset);
    }

    await videoJob.update({
      rawVideoUrl: outputUrl,
      finalVideoUrl: outputUrl,
      thumbnailUrl: videoJob.thumbnailUrl || outputUrl,
      videoProvider: "fal",
      progress: 100,
      metadata: {
        ...(videoJob.metadata || {}),
        falStatus: "OK",
        falOutputUrl: outputUrl,
        falWebhookAt: new Date().toISOString(),
        falPayload: payload.payload
      }
    });
    await videoJob.markAsCompleted();

    return res.status(200).json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[FalWebhookController] Error processing webhook request=${requestId}: ${message}`);
    return res.status(200).json({ success: true, acceptedWithProcessingError: true });
  }
};
