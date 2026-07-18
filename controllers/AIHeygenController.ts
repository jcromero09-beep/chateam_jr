import { Request, Response } from "express";
import HeygenService from "../services/AIHeygenServices/HeygenService";
import AppError from "../errors/AppError";

// GET /ai/heygen/videos — Listar videos generados
export const listVideos = async (req: Request, res: Response): Promise<Response> => {
  // TODO: Crear modelo AIHeygenVideo para persistir videos generados
  // Por ahora retorna array vacío
  return res.json({ success: true, data: [] });
};

// POST /ai/heygen/videos — Crear un video con avatar
export const createVideo = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { text, avatarId, voiceId, background } = req.body;

  if (!text || text.trim().length === 0) {
    throw new AppError("ERR_HEYGEN_TEXT_REQUIRED", 400);
  }

  const result = await HeygenService.createVideo(companyId, {
    text,
    avatarId,
    voiceId,
    background
  });

  return res.status(201).json({ success: true, data: result });
};

// GET /ai/heygen/videos/status/:videoId — Consultar estado de un video
export const getVideoStatus = async (req: Request, res: Response): Promise<Response> => {
  const { videoId } = req.params;

  if (!videoId) {
    throw new AppError("ERR_HEYGEN_VIDEO_ID_REQUIRED", 400);
  }

  const result = await HeygenService.getVideoStatus(videoId);

  return res.json({ success: true, data: result });
};

// GET /ai/heygen/avatars — Listar avatares disponibles
export const listAvatars = async (req: Request, res: Response): Promise<Response> => {
  const result = await HeygenService.listAvatars();

  return res.json({ success: true, data: result });
};

// GET /ai/heygen/voices — Listar voces disponibles
export const listVoices = async (req: Request, res: Response): Promise<Response> => {
  const result = await HeygenService.listVoices();

  return res.json({ success: true, data: result });
};

// GET /ai/heygen/quota — Consultar cuota restante
export const getQuota = async (req: Request, res: Response): Promise<Response> => {
  const result = await HeygenService.getQuota();

  return res.json({ success: true, data: result });
};
