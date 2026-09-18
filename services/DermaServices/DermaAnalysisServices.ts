/**
 * Consulta de análisis Derma: listado (por paciente o global), detalle, borrado
 * y saldo de créditos del módulo.
 */
import DermaAnalysis from "../../models/DermaAnalysis";
import DermaPatient from "../../models/DermaPatient";
import User from "../../models/User";
import AppError from "../../errors/AppError";
import GetBalanceService from "../AICreditServices/GetBalanceService";
import { DERMA_CREDIT_TYPE_KEY } from "./AnalyzeFaceService";
import {
  BASE_ANALYSIS_CREDITS,
  CLINICAL_DETAIL_CREDITS,
} from "./DermaMetricsCatalog";
import fs from "fs";

export const serializeAnalysis = (a: DermaAnalysis, withResult = true) => ({
  id: a.id,
  companyId: a.companyId,
  patientId: a.patientId,
  userId: a.userId ?? null,
  status: a.status,
  selectedMetrics: a.selectedMetrics || [],
  clinicalDetail: a.clinicalDetail,
  globalScore: a.globalScore ?? null,
  skinType: a.skinType ?? null,
  skinAge: a.skinAge ?? null,
  summary: a.summary ?? null,
  creditsUsed: a.creditsUsed,
  provider: a.provider ?? null,
  model: a.model ?? null,
  latencyMs: a.latencyMs ?? null,
  errorMessage: a.errorMessage ?? null,
  hasImage: Boolean(a.imagePath),
  metricsCount: Array.isArray(a.selectedMetrics) ? a.selectedMetrics.length : 0,
  createdAt: a.createdAt,
  updatedAt: a.updatedAt,
  ...(withResult ? { result: a.result ?? null } : {}),
  patient: (a as any).patient
    ? {
        id: (a as any).patient.id,
        name: (a as any).patient.name,
        age: (a as any).patient.age ?? null,
      }
    : undefined,
  user: (a as any).user
    ? { id: (a as any).user.id, name: (a as any).user.name }
    : undefined,
});

export interface ListAnalysesRequest {
  companyId: number;
  patientId?: number;
  pageNumber?: number | string;
  rowsPerPage?: number | string;
  status?: string;
}

export const ListDermaAnalysesService = async ({
  companyId,
  patientId,
  pageNumber = 1,
  rowsPerPage = 20,
  status,
}: ListAnalysesRequest) => {
  const page = Math.max(1, Number(pageNumber) || 1);
  const limit = Math.min(100, Math.max(1, Number(rowsPerPage) || 20));
  const offset = (page - 1) * limit;

  const where: any = { companyId };
  if (patientId) where.patientId = Number(patientId);
  if (status) where.status = String(status);

  const { rows, count } = await DermaAnalysis.findAndCountAll({
    where,
    include: [
      {
        model: DermaPatient,
        as: "patient",
        attributes: ["id", "name", "birthDate"],
        required: false,
      },
      { model: User, as: "user", attributes: ["id", "name"], required: false },
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return {
    analyses: rows.map((a) => serializeAnalysis(a, false)),
    count,
    hasMore: offset + rows.length < count,
  };
};

export const ShowDermaAnalysisService = async (
  companyId: number,
  id: number,
): Promise<DermaAnalysis> => {
  const analysis = await DermaAnalysis.findOne({
    where: { id, companyId },
    include: [
      { model: DermaPatient, as: "patient", required: false },
      { model: User, as: "user", attributes: ["id", "name"], required: false },
    ],
  });
  if (!analysis) throw new AppError("ERR_DERMA_ANALYSIS_NOT_FOUND", 404);
  return analysis;
};

/** Ruta y tipo MIME de la foto, verificando que exista en disco. */
export const GetDermaAnalysisImageService = async (
  companyId: number,
  id: number,
): Promise<{ path: string; mimeType: string }> => {
  const analysis = await DermaAnalysis.findOne({ where: { id, companyId } });
  if (!analysis?.imagePath || !fs.existsSync(analysis.imagePath)) {
    throw new AppError("ERR_DERMA_IMAGE_NOT_FOUND", 404);
  }
  return {
    path: analysis.imagePath,
    mimeType: analysis.imageMimeType || "image/jpeg",
  };
};

export const DeleteDermaAnalysisService = async (
  companyId: number,
  id: number,
): Promise<void> => {
  const analysis = await DermaAnalysis.findOne({ where: { id, companyId } });
  if (!analysis) throw new AppError("ERR_DERMA_ANALYSIS_NOT_FOUND", 404);
  const { patientId, imagePath } = analysis;
  await analysis.destroy();
  if (imagePath && fs.existsSync(imagePath)) {
    try {
      fs.unlinkSync(imagePath);
    } catch {
      // el fichero huérfano no bloquea el borrado del registro
    }
  }
  const { RefreshPatientSummary } = await import("./DermaPatientServices");
  await RefreshPatientSummary(companyId, patientId);
};

/** Saldo del tipo de crédito del módulo + equivalencias en análisis. */
export const GetDermaCreditsService = async (companyId: number) => {
  try {
    const { remainingCredits, balance } = await GetBalanceService({
      companyId,
      creditTypeKey: DERMA_CREDIT_TYPE_KEY,
    });
    const remaining = Math.max(0, Math.floor(Number(remainingCredits) || 0));
    return {
      creditTypeKey: DERMA_CREDIT_TYPE_KEY,
      configured: true,
      totalCredits: Number(balance.totalCredits) || 0,
      usedCredits: Number(balance.usedCredits) || 0,
      remaining,
      basicAnalysisCost: BASE_ANALYSIS_CREDITS,
      clinicalAnalysisCost: CLINICAL_DETAIL_CREDITS,
      basicAnalysesAvailable: Math.floor(remaining / BASE_ANALYSIS_CREDITS),
      clinicalAnalysesAvailable: Math.floor(
        remaining / CLINICAL_DETAIL_CREDITS,
      ),
    };
  } catch (err: any) {
    // Tipo de crédito aún no seedeado: informar sin romper la pantalla.
    if (
      err instanceof AppError &&
      err.message === "ERR_AI_CREDIT_TYPE_NOT_FOUND"
    ) {
      return {
        creditTypeKey: DERMA_CREDIT_TYPE_KEY,
        configured: false,
        totalCredits: 0,
        usedCredits: 0,
        remaining: 0,
        basicAnalysisCost: BASE_ANALYSIS_CREDITS,
        clinicalAnalysisCost: CLINICAL_DETAIL_CREDITS,
        basicAnalysesAvailable: 0,
        clinicalAnalysesAvailable: 0,
      };
    }
    throw err;
  }
};

export default {
  ListDermaAnalysesService,
  ShowDermaAnalysisService,
  GetDermaAnalysisImageService,
  DeleteDermaAnalysisService,
  GetDermaCreditsService,
  serializeAnalysis,
};
