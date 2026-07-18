import { Request, Response } from "express";
import AIVisionService from "../services/AIMultimodalServices/AIVisionService";
import AIPDFProcessorService from "../services/AIMultimodalServices/AIPDFProcessorService";
import AIYouTubeTranscriptService from "../services/AIMultimodalServices/AIYouTubeTranscriptService";
import AIRSSService from "../services/AIMultimodalServices/AIRSSService";
import AppError from "../errors/AppError";

// POST /ai/vision/analyze
export const analyzeImage = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { imageBase64, imageUrl, prompt, extractText, language } = req.body;
  const imageInput = imageUrl || imageBase64;
  if (!imageInput) throw new AppError("ERR_IMAGE_REQUIRED", 400);
  const result = await AIVisionService.analyzeImage(imageInput, companyId, { prompt, extractText, language });
  return res.json({ success: true, data: result });
};

// GET /ai/vision/history — Historial de análisis de visión (stub — futuro: persistir en BD)
export const getVisionHistory = async (req: Request, res: Response): Promise<Response> => {
  // TODO: Implementar persistencia de historial de análisis de visión
  return res.json({ success: true, data: [] });
};

// POST /ai/pdf/process
export const processPDF = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { pdfBase64, title, ingestToKB, generateSummary, extractEntities } = req.body;
  if (!pdfBase64) throw new AppError("ERR_PDF_REQUIRED", 400);
  const pdfBuffer = Buffer.from(pdfBase64, "base64");
  const result = await AIPDFProcessorService.processPDF(pdfBuffer, companyId, { title, ingestToKB, generateSummary, extractEntities });
  return res.json({ success: true, data: result });
};

// POST /ai/youtube/transcript
export const getTranscript = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { videoUrl, language, generateSummary } = req.body;
  if (!videoUrl) throw new AppError("ERR_VIDEO_URL_REQUIRED", 400);
  const result = await AIYouTubeTranscriptService.getTranscript(videoUrl, companyId, { language, generateSummary });
  return res.json({ success: true, data: result });
};

// POST /ai/rss/fetch
export const fetchRSS = async (req: Request, res: Response): Promise<Response> => {
  const { feedUrl, maxItems } = req.body;
  if (!feedUrl) throw new AppError("ERR_FEED_URL_REQUIRED", 400);
  const result = await AIRSSService.fetchFeed(feedUrl, { maxItems });
  return res.json({ success: true, data: result });
};

// POST /ai/rss/ingest
export const ingestRSS = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { feedUrl, maxItems } = req.body;
  if (!feedUrl) throw new AppError("ERR_FEED_URL_REQUIRED", 400);
  const result = await AIRSSService.ingestToKB(feedUrl, companyId, { maxItems });
  return res.json({ success: true, data: result });
};
