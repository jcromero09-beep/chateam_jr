import { Request, Response } from "express";
import FineTuningService from "../services/AIFineTuningServices/FineTuningService";
import DatasetService from "../services/AIFineTuningServices/DatasetService";
import AppError from "../errors/AppError";

// POST /ai/fine-tuning/jobs
export const createJob = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { baseModel, dataSource, hyperparameters, datasetOptions } = req.body;

  if (!baseModel) throw new AppError("ERR_BASE_MODEL_REQUIRED", 400);
  if (!dataSource) throw new AppError("ERR_DATA_SOURCE_REQUIRED", 400);

  const job = await FineTuningService.createJob(companyId, {
    baseModel,
    dataSource,
    hyperparameters,
    datasetOptions
  });

  return res.status(201).json({ success: true, data: job });
};

// GET /ai/fine-tuning/jobs
export const listJobs = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { status, limit, offset } = req.query;

  const result = await FineTuningService.listJobs(companyId, {
    status: status as string | undefined,
    limit: limit ? parseInt(limit as string, 10) : undefined,
    offset: offset ? parseInt(offset as string, 10) : undefined
  });

  return res.json({
    success: true,
    data: result.rows,
    pagination: {
      total: result.count,
      limit: limit ? parseInt(limit as string, 10) : 20,
      offset: offset ? parseInt(offset as string, 10) : 0
    }
  });
};

// GET /ai/fine-tuning/jobs/:jobId
export const getJob = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { jobId } = req.params;

  if (!jobId) throw new AppError("ERR_JOB_ID_REQUIRED", 400);

  // Refresh status from OpenAI before returning
  const job = await FineTuningService.checkStatus(jobId, companyId);

  return res.json({ success: true, data: job });
};

// POST /ai/fine-tuning/jobs/:jobId/cancel
export const cancelJob = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { jobId } = req.params;

  if (!jobId) throw new AppError("ERR_JOB_ID_REQUIRED", 400);

  const job = await FineTuningService.cancelJob(jobId, companyId);

  return res.json({ success: true, data: job });
};

// GET /ai/fine-tuning/jobs/:jobId/events
export const getJobEvents = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { jobId } = req.params;

  if (!jobId) throw new AppError("ERR_JOB_ID_REQUIRED", 400);

  const events = await FineTuningService.getJobEvents(jobId, companyId);

  return res.json({ success: true, data: events });
};

// GET /ai/fine-tuning/jobs/models
export const listModels = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  const models = await FineTuningService.listFineTunedModels(companyId);

  return res.json({ success: true, data: models });
};

// GET /ai/fine-tuning/data-sources
export const listDataSources = async (req: Request, res: Response): Promise<Response> => {
  // Fuentes de datos estáticas disponibles para fine-tuning
  const dataSources = [
    { key: "tickets", label: "Tickets resueltos", description: "Conversaciones de tickets cerrados exitosamente" },
    { key: "kb", label: "Knowledge Base", description: "Documentos de la base de conocimiento" },
    { key: "custom", label: "Dataset personalizado", description: "Archivo JSONL con pares de pregunta-respuesta" }
  ];
  return res.json({ success: true, data: dataSources });
};

// POST /ai/fine-tuning/jobs/prepare-dataset
export const prepareDataset = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { dataSource, options } = req.body;

  if (!dataSource) throw new AppError("ERR_DATA_SOURCE_REQUIRED", 400);

  let result: { data: string; samples: number; estimatedTokens: number };

  switch (dataSource) {
    case "tickets":
      result = await DatasetService.prepareFromTickets(companyId, options || {});
      break;
    case "kb":
      result = await DatasetService.prepareFromKB(companyId, options || {});
      break;
    default:
      throw new AppError("ERR_UNSUPPORTED_DATA_SOURCE", 400);
  }

  // Validate without returning full data (dry run)
  const validation = DatasetService.validateDataset(result.data);

  return res.json({
    success: true,
    data: {
      samples: result.samples,
      estimatedTokens: result.estimatedTokens,
      validation: {
        valid: validation.valid,
        errors: validation.errors,
        samples: validation.samples,
        estimatedTokens: validation.estimatedTokens
      }
    }
  });
};
