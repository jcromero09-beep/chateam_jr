/**
 * AnalyzeFaceService — orquesta un análisis facial completo:
 *
 *  1. valida paciente, métricas y foto
 *  2. normaliza la foto con sharp (orientación EXIF, máx. 1600px, JPEG) y la
 *     guarda en public/company{id}/derma/patient{id}/
 *  3. cobra créditos `derma_analysis` (1 básico / 15 con detalle clínico)
 *  4. llama al modelo de visión y persiste el resultado
 *  5. si el modelo falla: marca el análisis como failed y reembolsa
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import sharp from "sharp";
import DermaAnalysis from "../../models/DermaAnalysis";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import DeductCreditsService from "../AICreditServices/DeductCreditsService";
import RefundCreditsService from "../AICreditServices/RefundCreditsService";
import { analyzeFaceImage } from "./DermaVisionService";
import {
  ShowDermaPatientService,
  RefreshPatientSummary,
} from "./DermaPatientServices";
import {
  normalizeSelectedMetrics,
  calculateAnalysisCredits,
  parseBooleanFlag,
} from "./DermaMetricsCatalog";

const currentDir = dirname(fileURLToPath(import.meta.url));
// services/DermaServices → raíz del repo → public
export const DERMA_PUBLIC_ROOT = path.resolve(currentDir, "..", "..", "public");

export const DERMA_CREDIT_TYPE_KEY = "derma_analysis";
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1600;
const ACCEPTED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

export interface AnalyzeFaceRequest {
  companyId: number;
  userId: number;
  patientId: number;
  selectedMetrics: unknown; // array o CSV (multipart)
  clinicalDetail: unknown; // boolean o string
  file: {
    buffer: Buffer;
    mimetype: string;
    originalname?: string;
    size?: number;
  };
}

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

/** Normaliza la imagen: respeta EXIF, limita tamaño, convierte a JPEG. */
export const prepareImage = async (
  buffer: Buffer,
): Promise<{
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
}> => {
  const out = await sharp(buffer)
    .rotate()
    .resize({
      width: MAX_IMAGE_SIDE,
      height: MAX_IMAGE_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88 })
    .toBuffer({ resolveWithObject: true });
  return {
    buffer: out.data,
    mimeType: "image/jpeg",
    width: out.info.width,
    height: out.info.height,
  };
};

const AnalyzeFaceService = async (
  req: AnalyzeFaceRequest,
): Promise<DermaAnalysis> => {
  const { companyId, userId, patientId, file } = req;

  // 1. Validaciones
  if (!file?.buffer?.length)
    throw new AppError(
      "Adjunta una fotografía del rostro (campo 'image').",
      400,
    );
  if (file.buffer.length > MAX_IMAGE_BYTES)
    throw new AppError("La imagen supera el máximo de 15 MB.", 400);
  if (file.mimetype && !ACCEPTED_MIME.includes(file.mimetype.toLowerCase())) {
    throw new AppError("Formato no soportado. Usa JPG, PNG, WEBP o HEIC.", 400);
  }

  let selectedMetrics: string[];
  try {
    selectedMetrics = normalizeSelectedMetrics(req.selectedMetrics);
  } catch (err: any) {
    throw new AppError(err.message, 400);
  }
  const clinicalDetail = parseBooleanFlag(req.clinicalDetail);
  const credits = calculateAnalysisCredits(clinicalDetail);

  const patient = await ShowDermaPatientService(companyId, Number(patientId));

  // 2. Imagen
  let prepared: Awaited<ReturnType<typeof prepareImage>>;
  try {
    prepared = await prepareImage(file.buffer);
  } catch (err: any) {
    logger.warn(
      `[Derma] Imagen no procesable company=${companyId}: ${err.message}`,
    );
    throw new AppError(
      "No se pudo procesar la imagen. Comprueba que sea una foto válida.",
      400,
    );
  }

  const dir = path.join(
    DERMA_PUBLIC_ROOT,
    `company${companyId}`,
    "derma",
    `patient${patient.id}`,
  );
  ensureDir(dir);
  const fileName = `${Date.now()}_analysis.jpg`;
  const imagePath = path.join(dir, fileName);
  fs.writeFileSync(imagePath, prepared.buffer);

  // 3. Créditos (lanza 402 si no alcanza; super admin hace bypass)
  const analysis = await DermaAnalysis.create({
    companyId,
    patientId: patient.id,
    userId,
    status: "processing",
    imagePath,
    imageMimeType: prepared.mimeType,
    selectedMetrics,
    clinicalDetail,
    creditsUsed: 0,
  } as any);

  try {
    await DeductCreditsService({
      companyId,
      creditTypeKey: DERMA_CREDIT_TYPE_KEY,
      amount: credits,
      userId,
      description: `Derma: análisis facial${clinicalDetail ? " con detalle clínico" : ""} (paciente #${patient.id})`,
      source: "derma_analysis",
      sourceId: String(analysis.id),
    });
    await analysis.update({ creditsUsed: credits } as any);
  } catch (err: any) {
    await analysis.update({
      status: "failed",
      errorMessage: err.message || "Créditos insuficientes",
    } as any);
    throw err instanceof AppError
      ? err
      : new AppError(err.message || "ERR_AI_INSUFFICIENT_CREDITS", 402);
  }

  // 4. Visión
  try {
    const vision = await analyzeFaceImage({
      companyId,
      imageBase64: prepared.buffer.toString("base64"),
      mimeType: prepared.mimeType,
      selectedMetrics,
      clinicalDetail,
      patient: {
        name: patient.name,
        age: patient.age,
        gender: patient.gender ?? null,
        notes: patient.notes ?? null,
      },
    });

    await analysis.update({
      status: "completed",
      globalScore: vision.result.globalScore,
      skinType: vision.result.skinType,
      skinAge: vision.result.skinAge,
      summary: vision.result.summary,
      result: vision.result,
      provider: vision.provider,
      model: vision.model,
      tokensUsed: vision.tokensUsed,
      latencyMs: vision.latencyMs,
      errorMessage: null,
    } as any);

    await RefreshPatientSummary(companyId, patient.id);
    logger.info(
      `[Derma] Análisis #${analysis.id} completado company=${companyId} score=${vision.result.globalScore} ` +
        `provider=${vision.provider} tokens=${vision.tokensUsed} ${vision.latencyMs}ms`,
    );
    await analysis.reload();
    return analysis;
  } catch (err: any) {
    // 5. Fallo del modelo → failed + reembolso
    const message =
      err instanceof AppError
        ? err.message
        : err?.message || "Error en el análisis";
    await analysis.update({ status: "failed", errorMessage: message } as any);
    try {
      await RefundCreditsService({
        companyId,
        creditTypeKey: DERMA_CREDIT_TYPE_KEY,
        amount: credits,
        description: `Derma: reembolso por fallo del análisis #${analysis.id}`,
        source: "derma_analysis_refund",
        sourceId: String(analysis.id),
      });
      await analysis.update({ creditsUsed: 0 } as any);
    } catch (refundErr: any) {
      logger.error(
        `[Derma] No se pudo reembolsar análisis #${analysis.id}: ${refundErr.message}`,
      );
    }
    throw err instanceof AppError ? err : new AppError(message, 502);
  }
};

export default AnalyzeFaceService;
