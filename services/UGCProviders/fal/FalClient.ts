import { fal, type QueueStatus, type Result } from "@fal-ai/client";
import logger from "../../../utils/logger";
import {
  FalImageInput,
  FalImageOutput,
  FalQueueSubmitOutput,
  FalResult,
  FalSubmitOptions,
  FalVideoInput,
  FalVideoOutput
} from "./types";
import {
  FalProviderError,
  FalRateLimitError,
  FalTimeoutError,
  FalUnknownError
} from "./errors";
import { resolveFalConfig, resolveFalModels } from "./FalConfig";

if (process.env.FAL_KEY) {
  fal.config({ credentials: process.env.FAL_KEY });
}

const DEFAULT_IMAGE_MODEL = process.env.FAL_IMAGE_MODEL || "fal-ai/flux/schnell";
const DEFAULT_VIDEO_TEXT_MODEL = process.env.FAL_VIDEO_TEXT_MODEL || "fal-ai/wan-25-preview/text-to-video";
const DEFAULT_VIDEO_IMAGE_MODEL = process.env.FAL_VIDEO_IMAGE_MODEL || "fal-ai/wan-25-preview/image-to-video";
const DEFAULT_TIMEOUT_MS = Number(process.env.FAL_SUBSCRIBE_TIMEOUT_MS || 60_000);

async function ensureCredentials(companyId?: number | null): Promise<void> {
  const config = await resolveFalConfig(companyId);
  if (!config?.apiKey) {
    throw new FalProviderError("Fal.ai API key is not configured", "validation", 500);
  }
  fal.config({ credentials: config.apiKey });
}

function buildHeaders(options?: FalSubmitOptions): Record<string, string> {
  const headers: Record<string, string> = {};

  if (options?.runnerHint) headers["x-fal-runner-hint"] = options.runnerHint;
  if (options?.priority) headers["x-fal-queue-priority"] = options.priority;
  if (options?.noRetry) headers["x-fal-no-retry"] = "1";
  if (typeof options?.storeIO === "boolean") headers["x-fal-store-io"] = options.storeIO ? "1" : "0";
  if (options?.objectLifecyclePreference) {
    headers["x-fal-object-lifecycle-preference"] = options.objectLifecyclePreference;
  }

  return headers;
}

function normalizeWanDuration(duration?: number | "5" | "10"): "5" | "10" {
  if (duration === "5" || duration === "10") {
    return duration;
  }

  return Number(duration || 5) <= 5 ? "5" : "10";
}

function mapInput(input: FalImageInput | FalVideoInput): Record<string, unknown> {
  const mapped: Record<string, unknown> = {
    prompt: input.prompt.slice(0, 800)
  };

  if (input.negativePrompt) mapped.negative_prompt = input.negativePrompt;
  if (input.imageUrl) mapped.image_url = input.imageUrl;
  if ("duration" in input) mapped.duration = normalizeWanDuration(input.duration);
  if (input.aspectRatio) mapped.aspect_ratio = input.aspectRatio;
  if ("resolution" in input && input.resolution) mapped.resolution = input.resolution;
  if ("enablePromptExpansion" in input && typeof input.enablePromptExpansion === "boolean") {
    mapped.enable_prompt_expansion = input.enablePromptExpansion;
  }
  if ("enableSafetyChecker" in input && typeof input.enableSafetyChecker === "boolean") {
    mapped.enable_safety_checker = input.enableSafetyChecker;
  }
  if ("audioUrl" in input && input.audioUrl) mapped.audio_url = input.audioUrl;
  if (input.width) mapped.width = input.width;
  if (input.height) mapped.height = input.height;
  if (input.seed) mapped.seed = input.seed;

  return mapped;
}

function logQueueUpdate(model: string, status: QueueStatus): void {
  if (status.status === "IN_QUEUE") {
    logger.info(`[FalClient] ${model} IN_QUEUE position=${status.queue_position} request=${status.request_id}`);
    return;
  }

  if (status.status === "IN_PROGRESS") {
    logger.info(`[FalClient] ${model} IN_PROGRESS request=${status.request_id}`);
    for (const log of status.logs || []) {
      logger.info(`[FalClient:${model}] ${log.level}: ${log.message}`);
    }
    return;
  }

  logger.info(
    `[FalClient] ${model} COMPLETED request=${status.request_id} ` +
      `inference=${status.metrics?.inference_time ?? "n/a"}`
  );
}

function normalizeError(error: unknown): FalResult<never> {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (error instanceof FalProviderError) {
    return { success: false, error: error.message, errorType: error.errorType as never };
  }

  if (lower.includes("rate") || lower.includes("429")) {
    const rateError = new FalRateLimitError(message);
    return { success: false, error: rateError.message, errorType: "rate_limit" };
  }

  if (lower.includes("timeout") || lower.includes("aborted")) {
    const timeoutError = new FalTimeoutError(message);
    return { success: false, error: timeoutError.message, errorType: "timeout" };
  }

  const unknownError = new FalUnknownError(message);
  return { success: false, error: unknownError.message, errorType: "unknown" };
}

function success<T>(model: string, result: Result<T>): FalResult<T> {
  return {
    success: true,
    data: result.data,
    requestId: result.requestId,
    metadata: {
      provider: "fal",
      model,
      requestId: result.requestId
    }
  };
}

function inputCompanyId(input: FalImageInput | FalVideoInput): number | null {
  const value = (input as unknown as Record<string, unknown>).companyId;
  return typeof value === "number" ? value : null;
}

async function runImage(
  input: FalImageInput,
  options?: FalSubmitOptions
): Promise<FalResult<FalImageOutput>> {
  try {
    const companyId = inputCompanyId(input);
    await ensureCredentials(companyId);
    const models = await resolveFalModels(companyId);
    const model = input.model || models.imageModel;
    const result = await fal.subscribe(model, {
      input: mapInput(input),
      logs: true,
      timeout: options?.timeoutMs || DEFAULT_TIMEOUT_MS,
      startTimeout: options?.startTimeout,
      headers: buildHeaders(options),
      onQueueUpdate: status => logQueueUpdate(model, status)
    });

    return success(model, result as Result<FalImageOutput>);
  } catch (error: unknown) {
    return normalizeError(error);
  }
}

async function runVideo(
  input: FalVideoInput,
  options?: FalSubmitOptions
): Promise<FalResult<FalVideoOutput>> {
  try {
    const companyId = inputCompanyId(input);
    await ensureCredentials(companyId);
    const models = await resolveFalModels(companyId);
    const model = input.model || (input.imageUrl ? models.imageVideoModel : models.textVideoModel);
    const result = await fal.subscribe(model, {
      input: mapInput(input),
      logs: true,
      timeout: options?.timeoutMs || DEFAULT_TIMEOUT_MS,
      startTimeout: options?.startTimeout,
      headers: buildHeaders(options),
      onQueueUpdate: status => logQueueUpdate(model, status)
    });

    return success(model, result as Result<FalVideoOutput>);
  } catch (error: unknown) {
    return normalizeError(error);
  }
}

async function submitVideo(
  input: FalVideoInput,
  options: FalSubmitOptions
): Promise<FalResult<FalQueueSubmitOutput>> {
  try {
    const companyId = inputCompanyId(input);
    await ensureCredentials(companyId);
    const models = await resolveFalModels(companyId);
    const model = input.model || (input.imageUrl ? models.imageVideoModel : models.textVideoModel);
    const status = await fal.queue.submit(model, {
      input: mapInput(input),
      webhookUrl: options.webhookUrl,
      priority: options.priority,
      hint: options.runnerHint,
      startTimeout: options.startTimeout,
      headers: buildHeaders(options)
    });

    return {
      success: true,
      data: {
        requestId: status.request_id,
        status: status.status,
        responseUrl: status.response_url,
        statusUrl: status.status_url,
        cancelUrl: status.cancel_url,
        queuePosition: status.status === "IN_QUEUE" ? status.queue_position : undefined
      },
      requestId: status.request_id,
      metadata: {
        provider: "fal",
        model,
        requestId: status.request_id
      }
    };
  } catch (error: unknown) {
    return normalizeError(error);
  }
}

async function getQueueStatus(model: string, requestId: string): Promise<QueueStatus> {
  await ensureCredentials();
  const status = await fal.queue.status(model, { requestId, logs: true });
  logQueueUpdate(model, status);
  return status;
}

async function getQueueResult<T>(model: string, requestId: string): Promise<Result<T>> {
  await ensureCredentials();
  return fal.queue.result(model, { requestId }) as Promise<Result<T>>;
}

async function cancelRequest(model: string, requestId: string): Promise<void> {
  await ensureCredentials();
  await fal.queue.cancel(model, { requestId });
}

export default {
  runImage,
  runVideo,
  submitVideo,
  getQueueStatus,
  getQueueResult,
  cancelRequest
};

export { runImage, runVideo, submitVideo, getQueueStatus, getQueueResult, cancelRequest };
