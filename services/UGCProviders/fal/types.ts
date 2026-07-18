import type { QueueStatus, RequestLog } from "@fal-ai/client";

export type FalQueueStatus = QueueStatus["status"];
export type FalQueuePriority = "normal" | "low";

export type FalResult<T> =
  | { success: true; data: T; requestId?: string; metadata?: FalProviderMetadata }
  | { success: false; error: string; errorType?: FalErrorType; requestId?: string };

export type FalErrorType =
  | "rate_limit"
  | "timeout"
  | "content_policy"
  | "validation"
  | "webhook_signature"
  | "unknown";

export interface FalProviderMetadata {
  provider: "fal";
  model: string;
  requestId?: string;
  gatewayRequestId?: string;
  inferenceTime?: number | null;
  logs?: RequestLog[];
  costUSD?: number;
}

export interface FalSubmitOptions {
  webhookUrl?: string;
  timeoutMs?: number;
  startTimeout?: number;
  runnerHint?: string;
  priority?: FalQueuePriority;
  noRetry?: boolean;
  storeIO?: boolean;
  objectLifecyclePreference?: string;
}

export interface FalImageInput {
  prompt: string;
  negativePrompt?: string;
  imageUrl?: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
  seed?: number;
  model?: string;
}

export interface FalVideoInput {
  prompt: string;
  negativePrompt?: string;
  imageUrl?: string;
  duration?: number | "5" | "10";
  aspectRatio?: string;
  resolution?: "480p" | "720p" | "1080p";
  enablePromptExpansion?: boolean;
  enableSafetyChecker?: boolean;
  audioUrl?: string;
  width?: number;
  height?: number;
  seed?: number;
  model?: string;
}

export interface FalImageFile {
  url: string;
  width?: number;
  height?: number;
  content_type?: string;
}

export interface FalVideoFile {
  url: string;
  content_type?: string;
  file_name?: string;
  file_size?: number;
}

export interface FalImageOutput {
  images: FalImageFile[];
  prompt?: string;
  seed?: number;
}

export interface FalVideoOutput {
  video: FalVideoFile;
}

export interface FalQueueSubmitOutput {
  requestId: string;
  status: FalQueueStatus;
  responseUrl?: string;
  statusUrl?: string;
  cancelUrl?: string;
  queuePosition?: number;
}

export interface FalWebhookPayload<TPayload = FalImageOutput | FalVideoOutput> {
  request_id: string;
  gateway_request_id?: string;
  status: "OK" | "ERROR";
  payload?: TPayload;
  error?: string;
  error_type?: string;
  payload_error?: string;
}

export interface FalGeneratedAsset {
  assetId?: number;
  url: string;
  metadata: FalProviderMetadata & Record<string, unknown>;
  costUSD: number;
}

export interface FalProfilePhotoInput extends FalImageInput {
  companyId: number;
  agentIdentityId: number;
  photoType?: "profile" | "story_casual" | "activity_shot" | "banner";
}

export interface FalUGCImageInput extends FalImageInput {
  companyId: number;
  campaignId: number;
  videoJobId: number;
  assetType?: "generated_image" | "image_thumbnail" | "thumbnail";
}

export interface FalUGCVideoInput extends FalVideoInput {
  companyId: number;
  campaignId: number;
  videoJobId: number;
  webhookUrl?: string;
}
