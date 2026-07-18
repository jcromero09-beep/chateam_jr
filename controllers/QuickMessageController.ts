import * as Yup from "yup";
import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import ListService from "../services/QuickMessageService/ListService";
import CreateService from "../services/QuickMessageService/CreateService";
import ShowService from "../services/QuickMessageService/ShowService";
import UpdateService from "../services/QuickMessageService/UpdateService";
import DeleteService from "../services/QuickMessageService/DeleteService";
import FindService from "../services/QuickMessageService/FindService";

import QuickMessage from "../models/QuickMessage";
import QuickReplyIntentSuggestionService from "../services/AIAgentServices/QuickReplyIntentSuggestionService";
import QuickReplyRedraftService from "../services/AIAgentServices/QuickReplyRedraftService";
import QuickReplySemanticService from "../services/AIAgentServices/QuickReplySemanticService";
import logger from "../utils/logger";
import lodash from "lodash";
const { head } = lodash;
import fs from "fs";
import path from "path";

import AppError from "../errors/AppError";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  userId: string | number;
};

type StoreData = {
  shortcode: string;
  message: string;
  userId: number | number;
  mediaPath?: string;
  mediaName?: string;
  geral: boolean;
  isMedia: boolean;
  visao: boolean;
  intent?: string;
  intentKey?: string;
  isAiEnabled?: boolean;
};

type FindParams = {
  companyId: string;
  userId: string;
};

type SuggestIntentData = {
  shortcode?: string;
  message?: string;
  mediaName?: string;
  mediaUrl?: string;
  mediaDataUrl?: string;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber } = req.query as IndexQuery;
  const { companyId, id: userId } = req.user;
console.log('req.body',req.query)
  const { records, count, hasMore } = await ListService({
    searchParam,
    pageNumber,
    companyId,
    userId
  });

  return res.json({ records, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const data = req.body as StoreData;



  const schema = Yup.object().shape({
    shortcode: Yup.string().required(),
    message: data.isMedia ? Yup.string().notRequired() : Yup.string().required()
  });

  try {
    await schema.validate(data);
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const record = await CreateService({
    ...data,
    companyId,
    userId: req.user.id
  });

  const io = getIO();
  io.of(String(companyId))
  .emit(`company-${companyId}-quickmessage`, {
    action: "create",
    record
  });

  return res.status(200).json(record);
};

export const suggestAiIntent = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const data = req.body as SuggestIntentData;

  const suggestion = await QuickReplyIntentSuggestionService.suggest({
    companyId,
    shortcode: data.shortcode,
    message: data.message,
    mediaName: data.mediaName,
    mediaUrl: data.mediaUrl,
    mediaDataUrl: data.mediaDataUrl
  });

  return res.status(200).json(suggestion);
};

export const redraftMessage = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { shortcode, message } = req.body as { shortcode?: string; message?: string };

  const result = await QuickReplyRedraftService.redraft({
    companyId,
    shortcode,
    message
  });

  return res.status(200).json(result);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;

  const record = await ShowService(id, req.user.companyId);

  return res.status(200).json(record);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const data = req.body as StoreData;
  const { companyId } = req.user;

  const schema = Yup.object().shape({
    shortcode: Yup.string().required(),
    message: data.isMedia ? Yup.string().notRequired() : Yup.string().required()
  });

  try {
    await schema.validate(data);
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const { id } = req.params;

  const record = await UpdateService({
    ...data,
    userId: req.user.id,
    id,
    companyId,
  });

  const io = getIO();
  io.of(String(companyId))
  .emit(`company-${companyId}-quickmessage`, {
    action: "update",
    record
  });

  return res.status(200).json(record);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  await DeleteService(id);

  const io = getIO();
  io.of(String(companyId))
  .emit(`company-${companyId}-quickmessage`, {
    action: "delete",
    id
  });

  return res.status(200).json({ message: "Contacto suprimido" });
};

export const findList = async (
  req: Request,
  res: Response
): Promise<Response> => {
  // [Fase A] companyId y userId deben venir del usuario autenticado, no del query
  // (si falta userId, el FindService genera SQL inválido -> 500).
  const { companyId, id: userId } = req.user;
  const params = { ...(req.query as any), companyId: String(companyId), userId: String(userId) } as FindParams;
  const records: QuickMessage[] = await FindService(params);

  return res.status(200).json(records);
};

export const mediaUpload = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const files = req.files as Express.Multer.File[];

  console.log('[mediaUpload] req.files:', files);
  console.log('[mediaUpload] req.body:', req.body);

  const file = head(files);

  // ✅ AGREGADO: Validar que existe archivo
  if (!file) {
    console.log('[mediaUpload] ERROR: No se detectó archivo en req.files');
    return res.status(400).json({ error: 'No se ha proporcionado ningún archivo' });
  }

  try {
    const quickmessage = await QuickMessage.findByPk(id);

    // ✅ AGREGADO: Validar que existe el quickmessage
    if (!quickmessage) {
      return res.status(404).json({ error: 'Quick message no encontrado' });
    }

    await quickmessage.update ({
      mediaPath: file.filename,
      mediaName: file.originalname
    });

    if (quickmessage.isAiEnabled && quickmessage.intent) {
      try {
        await QuickReplySemanticService.syncEmbedding(quickmessage.id);
      } catch (embedErr: any) {
        logger.warn(`[QuickMessage/mediaUpload] Error sincronizando embedding: ${embedErr.message}`);
      }
    }

    return res.send({ mensagem: "Archivo adjunto" });
    } catch (err: any) {
      throw new AppError(err.message);
  }
};

export const deleteMedia = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user

  try {
    const quickmessage = await QuickMessage.findByPk(id);
    // Usar getDataValue para obtener el filename real en disco (sin el getter que devuelve URL completa)
    const storedFilename = quickmessage.getDataValue("mediaPath");
    const filePath = path.resolve("public", `company${companyId}`,"quickMessage", storedFilename);
    const fileExists = fs.existsSync(filePath);
    if (fileExists) {
      fs.unlinkSync(filePath);
    }
    await quickmessage.update ({
      mediaPath: null,
      mediaName: null
    });

    if (quickmessage.isAiEnabled && quickmessage.intent) {
      try {
        await QuickReplySemanticService.syncEmbedding(quickmessage.id);
      } catch (embedErr: any) {
        logger.warn(`[QuickMessage/deleteMedia] Error sincronizando embedding: ${embedErr.message}`);
      }
    }

    return res.send({ mensagem: "Archivo eliminado" });
    } catch (err: any) {
      throw new AppError(err.message);
  }
};
