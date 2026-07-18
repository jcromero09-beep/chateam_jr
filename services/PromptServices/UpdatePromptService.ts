import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);

import * as Yup from "yup";
import AppError from "../../errors/AppError";
import Prompt from "../../models/Prompt";
import PromptQueue from "../../models/PromptQueue";
import Queue from "../../models/Queue";
import ShowPromptService from "./ShowPromptService";
import path from "path";
import fs from "fs";
import { procesarArchivoYEmbeddings } from "../IntegrationsServices/procesarArchivoYEmbeddings";
import { invalidatePromptCache } from "../IntegrationsServices/PromptCacheService";
import { devLog, devError, devWarn } from "../../utils/logger"; // P3.44: Development-only logging

interface PromptData {
  id?: number;
  name: string;
  apiKey?: string; // Opcional - legacy, usar aiProviderId en su lugar
  aiProviderId?: number; // ID del proveedor de IA configurado
  prompt: string;
  fileNameIA?: string;
  maxTokens?: number;
  temperature?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  queueId?: number;
  queueIds?: number[];
  maxMessages?: number;
  companyId: string | number;
  voice?: string;
  voiceKey?: string;
  voiceRegion?: string;
}

interface Request {
  promptData: PromptData;
  promptId: string | number;
  companyId: string | number;
}

const UpdatePromptService = async ({
  promptId,
  promptData,
  companyId
}: Request): Promise<Prompt | undefined> => {
  const promptTable = await ShowPromptService({ promptId, companyId });

  const {
    name,
    apiKey,
    aiProviderId,
    prompt,
    fileNameIA,
    maxTokens,
    temperature,
    promptTokens,
    completionTokens,
    totalTokens,
    queueId,
    queueIds,
    maxMessages,
    voice,
    voiceKey,
    voiceRegion
  } = promptData;

  // Validación de datos del prompt (sin aiProviderId)
  const promptSchema = Yup.object().shape({
    name: Yup.string().required("ERR_PROMPT_NAME_INVALID"),
    prompt: Yup.string().required("ERR_PROMPT_PROMPT_INVALID"),
    apiKey: Yup.string().notRequired(),
    aiProviderId: Yup.number().notRequired(), // Opcional - no se usa
    queueId: Yup.number().notRequired(),
    queueIds: Yup.array().of(Yup.number()).notRequired(),
    maxMessages: Yup.number().required("ERR_PROMPT_MAX_MESSAGES_INVALID"),
  });

  try {
    await promptSchema.validate({
      name,
      apiKey,
      aiProviderId,
      prompt,
      queueId,
      queueIds,
      maxMessages,
      fileNameIA
    });
  } catch (err) {
    throw new AppError(`${JSON.stringify(err, undefined, 2)}`);
  }

  // Validar que todos los queueIds pertenecen a la compañía (si se proporcionan)
  if (queueIds && queueIds.length > 0) {
    devLog('[DEBUG] Validando queueIds:', queueIds);
    const queues = await Queue.findAll({
      where: {
        id: queueIds,
        companyId: Number(companyId)
      }
    });

    if (queues.length !== queueIds.length) {
      devError('[ERROR] Uno o más queueIds no pertenecen a la compañía');
      throw new AppError("ERR_INVALID_QUEUE_IDS");
    }
    devLog('[DEBUG] Todos los queueIds validados exitosamente');
  }

  // Validar queueId individual si se proporciona
  if (queueId && queueId !== 0) {
    devLog('[DEBUG] Validando queueId:', queueId);
    const queue = await Queue.findOne({
      where: {
        id: queueId,
        companyId: Number(companyId)
      }
    });

    if (!queue) {
      devError('[ERROR] queueId no pertenece a la compañía');
      throw new AppError("ERR_INVALID_QUEUE_ID");
    }
    devLog('[DEBUG] queueId validado exitosamente');
  }

  // 🧹 Eliminar archivo anterior y su embedding si hay uno nuevo
  const oldFileName = promptTable.getDataValue("fileNameIA");

  if (fileNameIA && oldFileName && fileNameIA !== oldFileName) {
    devLog(`[DEBUG] Eliminando archivo anterior: ${oldFileName}`);

    const oldFilePath = path.resolve(
      currentDir,
      "..",
      "..",
      "..",
      "public",
      `company${companyId}`,
      "ia",
      `file${companyId}`,
      oldFileName
    );

    const embeddingPath = path.resolve(
      currentDir,
      "..",
      "..",
      "..",
      "public",
      `company${companyId}`,
      "ia",
      "Embeddings",
      `${path.basename(oldFileName, path.extname(oldFileName))}.json`
    );

    // Usar operaciones asíncronas
    const fsPromises = fs.promises;
    try {
      await fsPromises.access(oldFilePath);
      await fsPromises.unlink(oldFilePath);
      devLog("🗑️ Archivo anterior eliminado:", oldFilePath);
    } catch (err) {
      devWarn("⚠️ Archivo anterior no encontrado o no se pudo eliminar:", oldFilePath);
    }

    try {
      await fsPromises.access(embeddingPath);
      await fsPromises.unlink(embeddingPath);
      devLog("🗑️ Embedding anterior eliminado:", embeddingPath);
    } catch (err) {
      devWarn("⚠️ Embedding anterior no encontrado o no se pudo eliminar:", embeddingPath);
    }
  }

  // ✅ Actualizar datos del prompt
  await promptTable.update({
    name,
    apiKey,
    aiProviderId,
    prompt,
    fileNameIA,
    maxTokens,
    temperature,
    promptTokens,
    completionTokens,
    totalTokens,
    queueId,
    maxMessages,
    voice,
    voiceKey,
    voiceRegion
  });

  await promptTable.reload();

  // 🔗 Actualizar relaciones con múltiples queues
  if (queueIds !== undefined) {
    devLog('[DEBUG] Actualizando relaciones con queues:', queueIds);

    // Eliminar relaciones anteriores
    await PromptQueue.destroy({
      where: { promptId: promptTable.id }
    });

    // Crear nuevas relaciones
    if (queueIds && queueIds.length > 0) {
      const promptQueuePromises = queueIds.map(qId =>
        PromptQueue.create({
          promptId: promptTable.id,
          queueId: qId
        })
      );
      await Promise.all(promptQueuePromises);
      devLog('[DEBUG] Relaciones con queues actualizadas exitosamente');
    }
  }

  // ⚙️ Generar embedding para el nuevo archivo (en segundo plano)
  if (fileNameIA && fileNameIA !== oldFileName) {
    devLog(`[DEBUG] Generando embedding para nuevo archivo: ${fileNameIA}`);

    const rutaDelArchivo = path.resolve(
      currentDir,
      "..",
      "..",
      "..",
      "public",
      `company${companyId}`,
      "ia",
      `file${companyId}`,
      fileNameIA
    );

    // Verificar que el archivo existe antes de intentar generar embeddings
    const fsPromises = fs.promises;
    try {
      await fsPromises.access(rutaDelArchivo);

      setImmediate(() => {
        procesarArchivoYEmbeddings(rutaDelArchivo, { companyId: Number(companyId) })
          .then(() => devLog("✅ Embedding regenerado correctamente"))
          .catch(err => devError("❌ Error al regenerar embedding:", err.message));
      });
    } catch (err) {
      devError(`⚠️ Archivo no encontrado, no se generará embedding: ${rutaDelArchivo}`);
    }
  } else if (!fileNameIA && oldFileName) {
    devLog(`[DEBUG] Archivo eliminado, no se generará embedding`);
  }

  // 🚀 CACHÉ: Invalidar caché del prompt actualizado
  await invalidatePromptCache(promptTable.id, Number(companyId));

  return promptTable;
};

export default UpdatePromptService;
