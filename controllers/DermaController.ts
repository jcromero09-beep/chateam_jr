/**
 * DermaController — endpoints del módulo de análisis facial profesional.
 * Todos requieren isAuth; el tenant sale de req.user.companyId.
 */
import { Request, Response } from "express";
import AppError from "../errors/AppError";
import {
  DERMA_METRICS,
  BASE_ANALYSIS_CREDITS,
  CLINICAL_DETAIL_CREDITS,
} from "../services/DermaServices/DermaMetricsCatalog";
import {
  CreateDermaPatientService,
  ListDermaPatientsService,
  ShowDermaPatientService,
  UpdateDermaPatientService,
  DeleteDermaPatientService,
  serializePatient,
} from "../services/DermaServices/DermaPatientServices";
import AnalyzeFaceService from "../services/DermaServices/AnalyzeFaceService";
import {
  ListDermaAnalysesService,
  ShowDermaAnalysisService,
  GetDermaAnalysisImageService,
  DeleteDermaAnalysisService,
  GetDermaCreditsService,
  serializeAnalysis,
} from "../services/DermaServices/DermaAnalysisServices";
import {
  buildDermaReportHtml,
  buildDermaReportPdf,
} from "../services/DermaServices/DermaReportService";

const tenant = (req: Request): { companyId: number; userId: number } => {
  const companyId = Number(req.user?.companyId);
  const userId = Number(req.user?.id);
  if (!companyId || !userId) throw new AppError("ERR_SESSION_EXPIRED", 401);
  return { companyId, userId };
};

// ---------------------------------------------------------------- catálogo
export const catalog = async (
  _req: Request,
  res: Response,
): Promise<Response> =>
  res.json({
    metrics: DERMA_METRICS.map(({ key, label, kind }) => ({
      key,
      label,
      kind,
    })),
    basicAnalysisCost: BASE_ANALYSIS_CREDITS,
    clinicalAnalysisCost: CLINICAL_DETAIL_CREDITS,
  });

export const credits = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  const { companyId } = tenant(req);
  return res.json(await GetDermaCreditsService(companyId));
};

// ---------------------------------------------------------------- pacientes
export const listPatients = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  const { companyId } = tenant(req);
  const { searchParam, pageNumber, rowsPerPage, includeInactive } =
    req.query as Record<string, string>;
  const data = await ListDermaPatientsService({
    companyId,
    searchParam,
    pageNumber,
    rowsPerPage,
    includeInactive: includeInactive === "true",
  });
  return res.json(data);
};

export const createPatient = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  const { companyId, userId } = tenant(req);
  const patient = await CreateDermaPatientService(
    companyId,
    userId,
    req.body || {},
  );
  return res.status(201).json(serializePatient(patient));
};

export const showPatient = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  const { companyId } = tenant(req);
  const patient = await ShowDermaPatientService(
    companyId,
    Number(req.params.id),
  );
  const recent = await ListDermaAnalysesService({
    companyId,
    patientId: patient.id,
    rowsPerPage: 10,
  });
  return res.json({
    ...serializePatient(patient),
    analyses: recent.analyses,
    analysesCount: recent.count,
  });
};

export const updatePatient = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  const { companyId } = tenant(req);
  const patient = await UpdateDermaPatientService(
    companyId,
    Number(req.params.id),
    req.body || {},
  );
  return res.json(serializePatient(patient));
};

export const removePatient = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  const { companyId } = tenant(req);
  await DeleteDermaPatientService(companyId, Number(req.params.id));
  return res.status(204).send();
};

// ---------------------------------------------------------------- análisis
export const analyze = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  const { companyId, userId } = tenant(req);
  const file = (req as any).file as
    | { buffer: Buffer; mimetype: string; originalname?: string; size?: number }
    | undefined;
  const body = req.body || {};
  const analysis = await AnalyzeFaceService({
    companyId,
    userId,
    patientId: Number(req.params.patientId || body.patientId),
    selectedMetrics: body.metrics ?? body.selectedMetrics ?? body["metrics[]"],
    clinicalDetail: body.clinicalDetail,
    file: file as any,
  });
  const full = await ShowDermaAnalysisService(companyId, analysis.id);
  return res.status(201).json(serializeAnalysis(full));
};

export const listAnalyses = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  const { companyId } = tenant(req);
  const { pageNumber, rowsPerPage, status, patientId } = req.query as Record<
    string,
    string
  >;
  const data = await ListDermaAnalysesService({
    companyId,
    patientId: req.params.patientId
      ? Number(req.params.patientId)
      : patientId
        ? Number(patientId)
        : undefined,
    pageNumber,
    rowsPerPage,
    status,
  });
  return res.json(data);
};

export const showAnalysis = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  const { companyId } = tenant(req);
  const analysis = await ShowDermaAnalysisService(
    companyId,
    Number(req.params.id),
  );
  return res.json(serializeAnalysis(analysis));
};

export const removeAnalysis = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  const { companyId } = tenant(req);
  await DeleteDermaAnalysisService(companyId, Number(req.params.id));
  return res.status(204).send();
};

export const analysisImage = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { companyId } = tenant(req);
  const { path: imagePath, mimeType } = await GetDermaAnalysisImageService(
    companyId,
    Number(req.params.id),
  );
  res
    .set("Content-Type", mimeType)
    .set("Cache-Control", "private, max-age=3600");
  res.sendFile(imagePath);
};

export const reportHtml = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  const { companyId } = tenant(req);
  const html = await buildDermaReportHtml(companyId, Number(req.params.id));
  return res.status(200).type("html").send(html);
};

export const reportPdf = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  const { companyId } = tenant(req);
  const id = Number(req.params.id);
  const buf = await buildDermaReportPdf(companyId, id);
  return res
    .status(200)
    .set("Content-Type", "application/pdf")
    .set(
      "Content-Disposition",
      `attachment; filename="derma-analisis-${id}.pdf"`,
    )
    .send(buf);
};
