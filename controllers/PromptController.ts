import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import CreatePromptService from "../services/PromptServices/CreatePromptService";
import DeletePromptService from "../services/PromptServices/DeletePromptService";
import ListPromptsService from "../services/PromptServices/ListPromptsService";
import ShowPromptService from "../services/PromptServices/ShowPromptService";
import UpdatePromptService from "../services/PromptServices/UpdatePromptService";
import Whatsapp from "../models/Whatsapp";
import fs from "fs";
import path from "path";
import Prompt from "../models/Prompt";

type IndexQuery = {
  searchParam?: string;
  pageNumber?: string | number;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { pageNumber, searchParam } = req.query as IndexQuery;

  // Validar que req.user existe (viene del middleware isAuth)
  if (!req.user || !req.user.companyId) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Usuario no autenticado o sin companyId"
    });
  }

  const { companyId } = req.user;
  const { prompts, count, hasMore } = await ListPromptsService({ searchParam, pageNumber, companyId });

  return res.status(200).json({ prompts, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  // Validar que req.user existe (viene del middleware isAuth)
  if (!req.user || !req.user.companyId) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Usuario no autenticado o sin companyId"
    });
  }

  const { companyId } = req.user;
  const fileNameIA = req.file?.filename; 
  console.log('[DEBUG] Verificando archivo adjunto...');
  let requestCount = 0;
console.log("🚨 Número de veces que se ejecuta store:", ++requestCount);

  if (fileNameIA) {
    console.log(`[DEBUG] Archivo recibido: ${fileNameIA}`);
    console.log(`[DEBUG] Detalles del archivo:`, {
      originalname: req.file?.originalname,
      size: req.file?.size,
      mimetype: req.file?.mimetype
    });
  } else {
    console.log('[DEBUG] No se recibió archivo adjunto');
  }
  let {
    name,
    apiKey,
    aiProviderId, // 👈 nuevo campo para proveedor de IA
    prompt,
    maxTokens,
    temperature,
    promptTokens,
    completionTokens,
    totalTokens,
    queueId,
    queueIds, // 👈 soporte para múltiples colas
    maxMessages,
    voice,
    voiceKey,
    voiceRegion
  } = req.body;

  // Parsear queueIds si llega como string JSON desde FormData
  // Esto convierte "[1,2,3,4,5]" en [1,2,3,4,5]
  if (typeof queueIds === 'string') {
    try {
      queueIds = JSON.parse(queueIds);
    } catch (error) {
      console.error('[ERROR] No se pudo parsear queueIds:', error);
      return res.status(400).json({
        error: 'invalid_queue_ids',
        message: 'El formato de queueIds es inválido'
      });
    }
  }

  // Parsear campos numéricos que llegan como strings desde FormData
  if (typeof queueId === 'string') {
    queueId = parseInt(queueId, 10);
  }
  if (typeof maxTokens === 'string') {
    maxTokens = parseInt(maxTokens, 10);
  }
  if (typeof temperature === 'string') {
    temperature = parseFloat(temperature);
  }
  if (typeof maxMessages === 'string') {
    maxMessages = parseInt(maxMessages, 10);
  }
  if (typeof aiProviderId === 'string') {
    aiProviderId = parseInt(aiProviderId, 10);
  }

  const promptTable = await CreatePromptService({
    name,
    apiKey,
    aiProviderId, // 👈 pasar aiProviderId al servicio
    prompt,
    fileNameIA, // 👈 archivo adjunto
    maxTokens,
    temperature,
    promptTokens,
    completionTokens,
    totalTokens,
    queueId,
    queueIds, // 👈 múltiples colas (ya parseado si era string)
    maxMessages,
    companyId,
    voice,
    voiceKey,
    voiceRegion
  });
  
  const io = getIO();
  io.of(String(companyId))
  .emit(`company-${companyId}-prompt`, {
    action: "update",
    prompt: promptTable
  });

  return res.status(200).json(promptTable);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { promptId } = req.params;

  // Validar que req.user existe (viene del middleware isAuth)
  if (!req.user || !req.user.companyId) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Usuario no autenticado o sin companyId"
    });
  }

  const { companyId } = req.user;
  const prompt = await ShowPromptService({ promptId, companyId });

  return res.status(200).json(prompt);
};

// export const update = async (
//   req: Request,
//   res: Response
// ): Promise<Response> => {
//   const { promptId } = req.params;
//   const authHeader = req.headers.authorization;
//   const [, token] = authHeader.split(" ");
//   const decoded = verify(token, authConfig.secret);
//   const { companyId } = decoded as TokenPayload;
//   const fileNameIA = req.file?.filename; 
//   const promptData = {
//     ...req.body,
//     fileNameIA // 👈 añadir aquí
//   };

//   const prompt = await UpdatePromptService({ promptData, promptId: promptId, companyId });

//   const io = getIO();
//   io.of(String(companyId))
//   .emit(`company-${companyId}-prompt`, {
//     action: "update",
//     prompt
//   });

//   return res.status(200).json(prompt);
// };

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { promptId } = req.params;

  // Validar que req.user existe (viene del middleware isAuth)
  if (!req.user || !req.user.companyId) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Usuario no autenticado o sin companyId"
    });
  }

  const { companyId } = req.user;
  const newFileNameIA = req.file?.filename;

  // 1. Buscar el prompt actual para eliminar archivo anterior
  const existingPrompt = await Prompt.findOne({ where: { id: promptId, companyId } });

  if (!existingPrompt) {
    return res.status(404).json({ error: "Prompt no encontrado" });
  }

  // 2. Si hay archivo anterior y se sube uno nuevo, lo eliminamos
  if (existingPrompt.getDataValue("fileNameIA") && newFileNameIA) {
    const oldFileName = existingPrompt.getDataValue("fileNameIA");
    const oldFilePath = path.resolve(
      currentDir,
      "..",
      "..",
      "public",
      `company${companyId}`,
      "ia",
      `file${companyId}`,
      oldFileName
    );

    if (fs.existsSync(oldFilePath)) {
      try {
        fs.unlinkSync(oldFilePath);
        console.log(`[DEBUG] Archivo anterior eliminado: ${oldFilePath}`);
      } catch (error) {
        console.error(`[ERROR] No se pudo eliminar el archivo anterior:`, error);
      }
    }
  }

  // 3. Parsear queueIds si llega como string JSON desde FormData (convierte "[1,2,3]" en [1,2,3])
  const parsedBody = { ...req.body };
  if (typeof parsedBody.queueIds === 'string') {
    try {
      parsedBody.queueIds = JSON.parse(parsedBody.queueIds);
    } catch (error) {
      console.error('[ERROR] No se pudo parsear queueIds:', error);
      return res.status(400).json({
        error: 'invalid_queue_ids',
        message: 'El formato de queueIds es inválido'
      });
    }
  }

  // Parsear campos numéricos que llegan como strings desde FormData
  if (typeof parsedBody.queueId === 'string') {
    parsedBody.queueId = parseInt(parsedBody.queueId, 10);
  }
  if (typeof parsedBody.maxTokens === 'string') {
    parsedBody.maxTokens = parseInt(parsedBody.maxTokens, 10);
  }
  if (typeof parsedBody.temperature === 'string') {
    parsedBody.temperature = parseFloat(parsedBody.temperature);
  }
  if (typeof parsedBody.maxMessages === 'string') {
    parsedBody.maxMessages = parseInt(parsedBody.maxMessages, 10);
  }
  if (typeof parsedBody.aiProviderId === 'string') {
    parsedBody.aiProviderId = parseInt(parsedBody.aiProviderId, 10);
  }

  // 4. Construir los datos para actualizar
  const promptData = {
    ...parsedBody,
    fileNameIA: newFileNameIA || existingPrompt.getDataValue("fileNameIA") // 👈 mantiene el anterior si no suben nuevo
  };

  const prompt = await UpdatePromptService({ promptData, promptId, companyId });

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-prompt`, {
    action: "update",
    prompt
  });

  return res.status(200).json(prompt);
};


export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { promptId } = req.params;

  // Validar que req.user existe (viene del middleware isAuth)
  if (!req.user || !req.user.companyId) {
    return res.status(401).json({
      error: "unauthorized",
      message: "Usuario no autenticado o sin companyId"
    });
  }

  const { companyId } = req.user;
  try {
    const { count } = await Whatsapp.findAndCountAll({ where: { promptId: +promptId, companyId } });

    if (count > 0) return res.status(200).json({ message: "¡No se puede borrar! Compruebe si este mensaje se utiliza para las conexiones de Whatsapp." });

    await DeletePromptService(promptId, companyId);

    const io = getIO();
    io.of(String(companyId))
  .emit(`company-${companyId}-prompt`, {
      action: "delete",
      intelligenceId: +promptId
    });

    return res.status(200).json({ message: "Prompt deleted" });
  } catch (err) {
    return res.status(500).json({ message: "¡No se puede borrar! Compruebe si se está utilizando este mensaje." });
  }
};

