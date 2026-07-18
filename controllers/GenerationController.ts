/**
 * GenerationController — endpoints HTTP NEUTRALES de generación (spec §3).
 *
 *   GET  /api/generation/models        listModels (catálogo unificado)
 *   GET  /api/generation/models/:id     modelDetail
 *   POST /api/generation/cost           estimación de costo dinámica
 *   POST /api/generation/jobs           crear job (reserva créditos)
 *   GET  /api/generation/jobs/:id        estado + resultados
 *   POST /api/generation/uploads        subir media de referencia (+)
 *   GET  /api/generation/characters     soul-id (@) — opcional
 *
 * La API key del proveedor NUNCA se expone; todo es server-side. Las
 * respuestas siguen el estándar { success, message, data, errors }.
 */

import { Request, Response } from "express";
import AppError from "../errors/AppError";
import logger from "../utils/logger";
import {
  getProvider,
  getAllProviders,
  resolveProviderForModel
} from "../services/Generation/ProviderRegistry";
import EstimateCostService from "../services/Generation/orchestrator/EstimateCostService";
import CreateGenerationJobService from "../services/Generation/orchestrator/CreateGenerationJobService";
import type {
  GenerationRequest,
  MediaType,
  NormalizedModel,
  ProviderId
} from "../services/Generation/types";
import UGCVideoJob from "../models/UGCVideoJob";
import UGCVideoAsset from "../models/UGCVideoAsset";

// --- Cache simple en memoria del catálogo (TTL) ---
const MODELS_CACHE_TTL_MS = 5 * 60 * 1000;
const modelsCache = new Map<string, { at: number; data: NormalizedModel[] }>();

function getUser(req: Request): { companyId: number; userId: number } {
  const user = (req as Request & { user?: { companyId: number; id: number } }).user;
  if (!user?.companyId) {
    throw new AppError("ERR_UNAUTHORIZED", 401);
  }
  return { companyId: user.companyId, userId: user.id };
}

function handleError(res: Response, err: unknown): Response {
  if (err instanceof AppError) {
    return res
      .status(err.statusCode || 400)
      .json({ success: false, message: err.message, data: null, errors: [err.message] });
  }
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`[GenerationController] ${message}`);
  return res
    .status(500)
    .json({ success: false, message: "Error interno de generación", data: null, errors: [message] });
}

/** GET /api/generation/models?type=image|video&provider= */
export const listModels = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = getUser(req);
    const mediaType = req.query.type as MediaType | undefined;
    const providerId = req.query.provider as ProviderId | undefined;

    const cacheKey = `${companyId}:${providerId || "all"}:${mediaType || "all"}`;
    const cached = modelsCache.get(cacheKey);
    if (cached && Date.now() - cached.at < MODELS_CACHE_TTL_MS) {
      return res.json({ success: true, message: "OK", data: cached.data, errors: null });
    }

    const providers = providerId ? [getProvider(providerId)] : getAllProviders();
    const all: NormalizedModel[] = [];
    for (const provider of providers) {
      try {
        const models = await provider.listModels({ mediaType, companyId });
        all.push(...models);
      } catch (err) {
        logger.warn(
          `[GenerationController] provider ${provider.id} listModels falló: ${String(err)}`
        );
      }
    }

    modelsCache.set(cacheKey, { at: Date.now(), data: all });
    return res.json({ success: true, message: "OK", data: all, errors: null });
  } catch (err) {
    return handleError(res, err);
  }
};

/** GET /api/generation/models/:id */
export const getModelDetail = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = getUser(req);
    const modelId = req.params.id;
    const provider = await resolveProviderForModel(modelId, companyId);
    const detail = await provider.getModel(modelId, { companyId });
    return res.json({ success: true, message: "OK", data: detail, errors: null });
  } catch (err) {
    return handleError(res, err);
  }
};

/** Construye un GenerationRequest neutro desde el body + token. */
function buildRequest(req: Request, companyId: number, userId: number): GenerationRequest {
  const b = req.body || {};
  return {
    tenantId: companyId,
    userId,
    mediaType: (b.mediaType === "image" ? "image" : "video") as MediaType,
    modelId: String(b.modelId || ""),
    prompt: String(b.prompt || ""),
    styleId: b.styleId ? String(b.styleId) : undefined,
    resolution: b.resolution ? String(b.resolution) : undefined,
    aspectRatio: b.aspectRatio ? String(b.aspectRatio) : undefined,
    duration: typeof b.duration === "number" ? b.duration : undefined,
    audio: typeof b.audio === "boolean" ? b.audio : undefined,
    references: Array.isArray(b.references) ? b.references.map(String) : undefined,
    characterIds: Array.isArray(b.characterIds) ? b.characterIds.map(String) : undefined,
    count: typeof b.count === "number" ? b.count : undefined,
    params: typeof b.params === "object" && b.params ? b.params : undefined,
    idempotencyKey: String(b.idempotencyKey || "")
  };
}

/** POST /api/generation/cost */
export const estimateCost = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, userId } = getUser(req);
    const request = buildRequest(req, companyId, userId);
    if (!request.modelId) throw new AppError("ERR_MODEL_ID_REQUIRED", 422);
    // idempotencyKey no es obligatoria para estimar.
    if (!request.idempotencyKey) request.idempotencyKey = "estimate-only";

    const estimate = await EstimateCostService({ req: request });
    return res.json({ success: true, message: "OK", data: estimate, errors: null });
  } catch (err) {
    return handleError(res, err);
  }
};

/** POST /api/generation/jobs */
export const createJob = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, userId } = getUser(req);
    const request = buildRequest(req, companyId, userId);
    const result = await CreateGenerationJobService({ req: request });
    return res.status(result.reused ? 200 : 201).json({
      success: true,
      message: result.reused ? "Job ya existente (idempotente)" : "Job creado",
      data: { jobId: result.jobId, status: result.status, credits: result.credits },
      errors: null
    });
  } catch (err) {
    return handleError(res, err);
  }
};

/** GET /api/generation/jobs/:id */
export const getJob = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = getUser(req);
    const id = Number(req.params.id);
    const job = await UGCVideoJob.findOne({
      where: { id, companyId },
      include: [
        {
          model: UGCVideoAsset,
          as: "assets",
          where: { isActive: true },
          required: false
        }
      ]
    });
    if (!job) throw new AppError("ERR_JOB_NOT_FOUND", 404);

    const outputs = (job.assets || [])
      .filter(a => ["generated_image", "raw_video", "composed_final"].includes(a.assetType))
      .map(a => ({
        url: a.originalUrl || a.localPath,
        mediaType: a.mimeType?.startsWith("image/") ? "image" : "video",
        mimeType: a.mimeType,
        fileName: a.fileName,
        thumbnailUrl: job.thumbnailUrl
      }));

    return res.json({
      success: true,
      message: "OK",
      data: {
        jobId: job.id,
        status: job.status,
        stage: job.stage,
        progress: job.progress,
        provider: job.provider,
        mediaType: job.mediaType,
        modelKey: job.modelKey,
        styleId: job.styleId,
        prompt: job.promptText,
        error: job.errorMessage,
        outputs
      },
      errors: null
    });
  } catch (err) {
    return handleError(res, err);
  }
};

/** POST /api/generation/uploads (multipart, campo "file") */
export const uploadMedia = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = getUser(req);
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) throw new AppError("ERR_NO_FILE", 422);

    const providerId = (req.body?.provider as ProviderId) || "higgsfield";
    const provider = getProvider(providerId);
    const result = await provider.uploadMedia({
      companyId,
      filePath: file.path,
      fileName: file.originalname,
      mimeType: file.mimetype
    });
    return res
      .status(201)
      .json({ success: true, message: "Subido", data: result, errors: null });
  } catch (err) {
    return handleError(res, err);
  }
};

/**
 * POST /api/generation/debug
 * Modo depuración SIN gastar créditos:
 *  - Siempre devuelve `built` = el payload EXACTO que se enviaría al proveedor.
 *  - Si body.validate===true, además envía una validación (campo inválido) al
 *    proveedor → NO crea job ni cobra; devuelve cómo el servidor lo recibe.
 */
export const debug = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId, userId } = getUser(req);
    const request = buildRequest(req, companyId, userId);
    if (!request.modelId) throw new AppError("ERR_MODEL_ID_REQUIRED", 422);
    if (!request.idempotencyKey) request.idempotencyKey = "debug-only";

    const provider = await resolveProviderForModel(request.modelId, companyId);
    const built = provider.debugBuild ? provider.debugBuild(request) : null;

    let estimate = null;
    try {
      estimate = await EstimateCostService({ req: request, providerId: provider.id });
    } catch {
      /* costo es best-effort en debug */
    }

    let validation = null;
    if (req.body?.validate === true && provider.debugValidate) {
      validation = await provider.debugValidate(request);
    }

    return res.json({
      success: true,
      message: "Debug (sin cargos)",
      data: { providerId: provider.id, built, estimate, validation },
      errors: null
    });
  } catch (err) {
    return handleError(res, err);
  }
};

/** GET /api/generation/characters?provider=higgsfield */
export const listCharacters = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { companyId } = getUser(req);
    const providerId = (req.query.provider as ProviderId) || "higgsfield";
    const provider = getProvider(providerId);
    const characters = provider.listCharacters
      ? await provider.listCharacters(companyId)
      : [];
    return res.json({ success: true, message: "OK", data: characters, errors: null });
  } catch (err) {
    return handleError(res, err);
  }
};
