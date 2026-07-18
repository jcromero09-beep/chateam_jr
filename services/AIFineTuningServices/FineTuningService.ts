import { Op } from "sequelize";
import AIFineTuningJob from "../../models/AIFineTuningJob";
import DatasetService from "./DatasetService";
import logger from "../../utils/logger";
import AppError from "../../errors/AppError";
import { getApiKeyWithFallback } from "../AIProviderService";

// -------------------------------------------------------
// Types
// -------------------------------------------------------

type DataSource = "tickets" | "kb" | "manual" | "mixed";

interface CreateJobData {
  baseModel: string;
  dataSource: DataSource;
  hyperparameters?: {
    n_epochs?: number | "auto";
    batch_size?: number | "auto";
    learning_rate_multiplier?: number | "auto";
  };
  datasetOptions?: {
    limit?: number;
    minMessages?: number;
    onlyResolved?: boolean;
    documentIds?: number[];
  };
}

interface ListFilters {
  status?: string;
  limit?: number;
  offset?: number;
}

interface OpenAIFileResponse {
  id: string;
  object: string;
  bytes: number;
  created_at: number;
  filename: string;
  purpose: string;
  status: string;
}

interface OpenAIJobResponse {
  id: string;
  object: string;
  model: string;
  created_at: number;
  finished_at: number | null;
  fine_tuned_model: string | null;
  status: string;
  trained_tokens: number | null;
  training_file: string;
  validation_file: string | null;
  result_files: string[];
  hyperparameters: Record<string, unknown>;
  error: { message: string; code: string } | null;
}

interface OpenAIEvent {
  id: string;
  object: string;
  created_at: number;
  level: string;
  message: string;
  data: Record<string, unknown> | null;
  type: string;
}

interface OpenAIEventsResponse {
  object: string;
  data: OpenAIEvent[];
  has_more: boolean;
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

const getApiKey = async (companyId?: number): Promise<string> => {
  return getApiKeyWithFallback('openai', 'OPENAI_API_KEY', companyId);
};

/**
 * Estimate fine-tuning cost based on model and tokens.
 * Prices per 1M training tokens (approximate, as of 2025):
 * - gpt-4o-mini-2024-07-18: $3.00
 * - gpt-4o-2024-08-06: $25.00
 * - gpt-3.5-turbo: $8.00
 * - gpt-4.1-mini: $3.00
 */
const estimateCost = (baseModel: string, estimatedTokens: number, epochs: number): number => {
  const pricePerMillionTokens: Record<string, number> = {
    "gpt-4o-mini-2024-07-18": 3.0,
    "gpt-4o-2024-08-06": 25.0,
    "gpt-3.5-turbo-0125": 8.0,
    "gpt-3.5-turbo": 8.0,
    "gpt-4.1-mini": 3.0,
    "gpt-4.1-nano": 1.0
  };

  // Default to $8 per 1M tokens if model not found
  const pricePerM = pricePerMillionTokens[baseModel] || 8.0;
  return parseFloat(((estimatedTokens / 1_000_000) * pricePerM * epochs).toFixed(4));
};

// -------------------------------------------------------
// Service Functions
// -------------------------------------------------------

/**
 * Create a new fine-tuning job:
 * 1. Prepare dataset from the specified data source
 * 2. Validate the dataset
 * 3. Upload training file to OpenAI
 * 4. Create fine-tuning job via OpenAI API
 * 5. Save AIFineTuningJob record
 */
const createJob = async (
  companyId: number,
  data: CreateJobData
): Promise<AIFineTuningJob> => {
  const { baseModel, dataSource, hyperparameters, datasetOptions } = data;
  const apiKey = await getApiKey();

  // 1. Prepare dataset
  logger.info(`[FineTuning] Preparing dataset from "${dataSource}" for company ${companyId}`);

  let datasetResult: { data: string; samples: number; estimatedTokens: number };

  switch (dataSource) {
    case "tickets":
      datasetResult = await DatasetService.prepareFromTickets(companyId, {
        limit: datasetOptions?.limit,
        minMessages: datasetOptions?.minMessages,
        onlyResolved: datasetOptions?.onlyResolved ?? true
      });
      break;
    case "kb":
      datasetResult = await DatasetService.prepareFromKB(companyId, {
        documentIds: datasetOptions?.documentIds,
        limit: datasetOptions?.limit
      });
      break;
    default:
      throw new AppError("ERR_UNSUPPORTED_DATA_SOURCE", 400);
  }

  if (datasetResult.samples === 0) {
    throw new AppError("ERR_NO_TRAINING_DATA", 400);
  }

  // 2. Validate dataset
  const validation = DatasetService.validateDataset(datasetResult.data);
  if (!validation.valid) {
    throw new AppError(
      `ERR_INVALID_DATASET: ${validation.errors.slice(0, 5).join("; ")}`,
      400
    );
  }

  // 3. Upload training file to OpenAI
  logger.info(`[FineTuning] Uploading training file (${datasetResult.samples} samples) to OpenAI`);

  const fileBlob = new Blob([datasetResult.data], { type: "application/jsonl" });
  const formData = new FormData();
  formData.append("purpose", "fine-tune");
  formData.append("file", fileBlob, `train_company${companyId}_${Date.now()}.jsonl`);

  const uploadResponse = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!uploadResponse.ok) {
    const errorBody = await uploadResponse.text();
    logger.error(`[FineTuning] File upload failed: ${errorBody}`);
    throw new AppError(`ERR_OPENAI_FILE_UPLOAD: ${uploadResponse.status}`, 502);
  }

  const fileData = (await uploadResponse.json()) as OpenAIFileResponse;
  logger.info(`[FineTuning] File uploaded: ${fileData.id}`);

  // 4. Create fine-tuning job
  const epochs = (hyperparameters?.n_epochs && hyperparameters.n_epochs !== "auto")
    ? hyperparameters.n_epochs
    : 3;

  const jobPayload: Record<string, unknown> = {
    training_file: fileData.id,
    model: baseModel,
    hyperparameters: {
      n_epochs: hyperparameters?.n_epochs ?? "auto",
      batch_size: hyperparameters?.batch_size ?? "auto",
      learning_rate_multiplier: hyperparameters?.learning_rate_multiplier ?? "auto"
    }
  };

  const jobResponse = await fetch("https://api.openai.com/v1/fine_tuning/jobs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(jobPayload)
  });

  if (!jobResponse.ok) {
    const errorBody = await jobResponse.text();
    logger.error(`[FineTuning] Job creation failed: ${errorBody}`);
    throw new AppError(`ERR_OPENAI_JOB_CREATE: ${jobResponse.status}`, 502);
  }

  const jobData = (await jobResponse.json()) as OpenAIJobResponse;
  logger.info(`[FineTuning] Job created: ${jobData.id} (status: ${jobData.status})`);

  // 5. Save local record
  const estimatedCost = estimateCost(
    baseModel,
    datasetResult.estimatedTokens,
    typeof epochs === "number" ? epochs : 3
  );

  const record = await AIFineTuningJob.create({
    companyId,
    jobId: jobData.id,
    provider: "openai",
    baseModel,
    trainingFileId: fileData.id,
    status: jobData.status as AIFineTuningJob["status"],
    hyperparameters: jobPayload.hyperparameters as Record<string, unknown>,
    trainingSamples: datasetResult.samples,
    estimatedCostUsd: estimatedCost,
    dataSource,
    metadata: {
      datasetOptions: datasetOptions || {},
      estimatedTokens: datasetResult.estimatedTokens,
      createdVia: "api"
    },
    startedAt: new Date()
  } as Partial<AIFineTuningJob>);

  logger.info(
    `[FineTuning] Record saved: id=${record.id}, jobId=${jobData.id}, estimatedCost=$${estimatedCost}`
  );

  return record;
};

/**
 * Check the current status of a fine-tuning job from OpenAI
 * and update the local database record.
 */
const checkStatus = async (
  jobId: string,
  companyId: number
): Promise<AIFineTuningJob> => {
  const apiKey = await getApiKey();

  // Find local record
  const record = await AIFineTuningJob.findOne({
    where: { jobId, companyId }
  });

  if (!record) {
    throw new AppError("ERR_FINETUNING_JOB_NOT_FOUND", 404);
  }

  // Call OpenAI to get current status
  const response = await fetch(`https://api.openai.com/v1/fine_tuning/jobs/${jobId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(`[FineTuning] Status check failed for ${jobId}: ${errorBody}`);
    throw new AppError(`ERR_OPENAI_STATUS_CHECK: ${response.status}`, 502);
  }

  const jobData = (await response.json()) as OpenAIJobResponse;

  // Update local record
  const updateFields: Partial<Record<string, unknown>> = {
    status: jobData.status
  };

  if (jobData.fine_tuned_model) {
    updateFields.fineTunedModel = jobData.fine_tuned_model;
  }

  if (jobData.trained_tokens) {
    updateFields.trainedTokens = jobData.trained_tokens;
  }

  if (jobData.error) {
    updateFields.errorMessage = jobData.error.message;
  }

  if (jobData.finished_at) {
    updateFields.completedAt = new Date(jobData.finished_at * 1000);
  }

  if (jobData.hyperparameters) {
    updateFields.hyperparameters = jobData.hyperparameters;
  }

  await record.update(updateFields);

  logger.info(`[FineTuning] Status updated for ${jobId}: ${jobData.status}`);

  return record;
};

/**
 * List fine-tuning jobs for a company with optional filters and pagination.
 */
const listJobs = async (
  companyId: number,
  filters: ListFilters = {}
): Promise<{ rows: AIFineTuningJob[]; count: number }> => {
  const { status, limit = 20, offset = 0 } = filters;

  const where: Record<string, unknown> = { companyId };

  if (status) {
    where.status = status;
  }

  const result = await AIFineTuningJob.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset
  });

  return { rows: result.rows, count: result.count };
};

/**
 * Cancel a running fine-tuning job.
 */
const cancelJob = async (
  jobId: string,
  companyId: number
): Promise<AIFineTuningJob> => {
  const apiKey = await getApiKey();

  // Find local record
  const record = await AIFineTuningJob.findOne({
    where: { jobId, companyId }
  });

  if (!record) {
    throw new AppError("ERR_FINETUNING_JOB_NOT_FOUND", 404);
  }

  // Call OpenAI cancel endpoint
  const response = await fetch(`https://api.openai.com/v1/fine_tuning/jobs/${jobId}/cancel`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(`[FineTuning] Cancel failed for ${jobId}: ${errorBody}`);
    throw new AppError(`ERR_OPENAI_CANCEL: ${response.status}`, 502);
  }

  const jobData = (await response.json()) as OpenAIJobResponse;

  await record.update({
    status: jobData.status as AIFineTuningJob["status"],
    completedAt: new Date()
  });

  logger.info(`[FineTuning] Job ${jobId} cancelled`);

  return record;
};

/**
 * Get events/logs for a fine-tuning job from OpenAI.
 */
const getJobEvents = async (
  jobId: string,
  companyId: number
): Promise<OpenAIEvent[]> => {
  const apiKey = await getApiKey();

  // Verify ownership
  const record = await AIFineTuningJob.findOne({
    where: { jobId, companyId }
  });

  if (!record) {
    throw new AppError("ERR_FINETUNING_JOB_NOT_FOUND", 404);
  }

  const response = await fetch(`https://api.openai.com/v1/fine_tuning/jobs/${jobId}/events?limit=50`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    logger.error(`[FineTuning] Events fetch failed for ${jobId}: ${errorBody}`);
    throw new AppError(`ERR_OPENAI_EVENTS: ${response.status}`, 502);
  }

  const eventsData = (await response.json()) as OpenAIEventsResponse;
  return eventsData.data;
};

/**
 * List all successfully fine-tuned models for a company.
 */
const listFineTunedModels = async (
  companyId: number
): Promise<Array<{ id: number; fineTunedModel: string; baseModel: string; completedAt: Date | null }>> => {
  const jobs = await AIFineTuningJob.findAll({
    where: {
      companyId,
      status: "succeeded",
      fineTunedModel: { [Op.ne]: null }
    },
    attributes: ["id", "fineTunedModel", "baseModel", "completedAt"],
    order: [["completedAt", "DESC"]]
  });

  return jobs.map((j) => ({
    id: j.id,
    fineTunedModel: j.fineTunedModel,
    baseModel: j.baseModel,
    completedAt: j.completedAt
  }));
};

export default {
  createJob,
  checkStatus,
  listJobs,
  cancelJob,
  getJobEvents,
  listFineTunedModels
};
