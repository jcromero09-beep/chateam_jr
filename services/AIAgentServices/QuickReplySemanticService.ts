/**
 * QuickReplySemanticService — Búsqueda Semántica de QuickReplies con pgvector
 *
 * Permite que el orquestador IA considere respuestas rápidas predefinidas
 * de forma semántica (no solo por shortcode), inyectándolas como opciones
 * relevantes en el bloque de contexto cuando el score de similitud ≥ 0.75.
 *
 * Flujo:
 * 1. Admin marca QuickReply como isAiEnabled=true y escribe un intent
 * 2. Se genera embedding del intent en DB
 * 3. Al llegar mensaje, se busca por similitud vectorial
 * 4. Si score ≥ 0.75 → se incluyen en el bloque de contexto
 *
 * @module AIAgentServices/QuickReplySemanticService
 */

import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import EmbeddingService from "../RAGServices/EmbeddingService";
import QuickMessage from "../../models/QuickMessage";
import logger from "../../utils/logger";

const SERVICE_PREFIX = "[QuickReplySemanticService]";
const DEFAULT_SIMILARITY_THRESHOLD = 0.45;
const MAX_RELEVANT_REPLIES = 5;

export interface RelevantQuickReply {
  id: number;
  shortcode: string;
  message: string;
  intent: string;
  intentKey?: string;
  similarity: number;
  mediaPath?: string;
  mediaName?: string;
}

const buildEmbeddingText = (qm: QuickMessage): string => {
  return [
    qm.intentKey ? `key:${qm.intentKey}` : "",
    qm.intent ? `intent:${qm.intent}` : "",
    qm.shortcode ? `shortcode:${qm.shortcode}` : "",
    qm.message ? `message:${qm.message}` : "",
    qm.mediaName ? `media:${qm.mediaName}` : ""
  ].filter(Boolean).join("\n");
};

const buildSupervisorBlockFromCandidates = (
  relevant: RelevantQuickReply[]
): string => {
  if (!relevant || relevant.length === 0) {
    return "";
  }

  const lines = [
    `## RESPUESTAS RAPIDAS DISPONIBLES`,
    `Estas fichas son MATERIAL OPCIONAL para apoyar la respuesta.`,
    `Solo consideralas cuando en ESTE turno ya corresponda compartir una ficha o contenido concreto.`,
    `Si aun estas calificando al cliente (presupuesto, tipo de vehiculo, uso, etc.), NO las menciones ni asumas que se enviaran.`,
    `Si eliges una, debe coincidir claramente con el contexto actual y con lo que ya decidiste responder.`,
    ``
  ];

  relevant.forEach((qr, i) => {
    const matchLabel = qr.similarity >= 0.9 ? "[alto]" : qr.similarity >= 0.75 ? "[medio]" : "[bajo]";
    const mediaTag = qr.mediaPath ? " [tiene imagen]" : "";
    lines.push(
      `${matchLabel} opcion ${i + 1}: /${qr.shortcode} - key: "${qr.intentKey || "sin_key"}" - intencion: "${qr.intent}"${mediaTag}`,
      `contenido: ${qr.message}`,
      ``
    );
  });

  return lines.join("\n");
};

/**
 * Genera / regenera el embedding del campo intent de un QuickMessage
 * Se llama al crear o editar un QuickReply con isAiEnabled=true
 */
const syncEmbedding = async (quickMessageId: number): Promise<void> => {
  try {
    const qm = await QuickMessage.findByPk(quickMessageId);
    if (!qm) {
      logger.warn(`${SERVICE_PREFIX} QuickMessage ${quickMessageId} no encontrado`);
      return;
    }

    if (!qm.intent || !qm.isAiEnabled) {
      // Limpiar embedding si se deshabilitó o borró el intent
      if (qm.intentEmbedding) {
        await sequelize.query(
          `UPDATE "QuickMessages" SET "intentEmbedding" = NULL WHERE id = :id`,
          { replacements: { id: quickMessageId }, type: QueryTypes.UPDATE }
        );
      }
      logger.info(`${SERVICE_PREFIX} Embedding limpiado para QuickMessage ${quickMessageId}`);
      return;
    }

    // Generar embedding con señales estructuradas, no solo con intent.
    const embeddingText = buildEmbeddingText(qm);
    const embedding = await EmbeddingService.generateEmbedding(embeddingText, qm.companyId);

    await sequelize.query(
      `UPDATE "QuickMessages" SET "intentEmbedding" = :embedding::vector WHERE id = :id`,
      {
        replacements: {
          id: quickMessageId,
          embedding: `[${embedding.join(",")}]`
        },
        type: QueryTypes.UPDATE
      }
    );

    logger.info(
      `${SERVICE_PREFIX} Embedding generado para QuickMessage ${quickMessageId}: ` +
      `key="${qm.intentKey || ""}", intent="${qm.intent}"`
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`${SERVICE_PREFIX} Error generando embedding: ${msg}`);
  }
};

/**
 * Busca QuickReplies semánticamente relevantes para el mensaje actual
 * Solo retorna los que tienen score >= threshold
 */
const findRelevant = async (
  currentMessage: string,
  companyId: number,
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): Promise<RelevantQuickReply[]> => {
  if (!currentMessage || currentMessage.trim().length === 0) {
    return [];
  }

  try {
    // Generar embedding del mensaje actual
    const queryEmbedding = await EmbeddingService.generateEmbedding(currentMessage, companyId);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // Búsqueda semántica en QuickMessages habilitadas para IA
    const sql = `
      SELECT
        id,
        shortcode,
        message,
        intent,
        "intentKey",
        "mediaPath",
        "mediaName",
        (1 - ("intentEmbedding" <=> :embedding::vector)) AS similarity
      FROM "QuickMessages"
      WHERE "companyId" = :companyId
        AND "isAiEnabled" = true
        AND "intent" IS NOT NULL
        AND "intentEmbedding" IS NOT NULL
        AND (1 - ("intentEmbedding" <=> :embedding::vector)) >= :threshold
      ORDER BY "intentEmbedding" <=> :embedding::vector ASC
      LIMIT :limit
    `;

    const results = await sequelize.query<{
      id: number;
      shortcode: string;
      message: string;
      intent: string;
      intentKey: string | null;
      similarity: number;
      mediaPath: string | null;
      mediaName: string | null;
    }>(sql, {
      replacements: {
        embedding: embeddingStr,
        companyId,
        threshold,
        limit: MAX_RELEVANT_REPLIES
      },
      type: QueryTypes.SELECT
    });

    logger.info(
      `${SERVICE_PREFIX} Búsqueda: "${currentMessage.substring(0, 40)}..." → ` +
      `${results.length} QuickReplies relevantes (threshold=${threshold})`
    );

    return results.map(r => ({
      id: r.id,
      shortcode: r.shortcode,
      message: r.message,
      intent: r.intent,
      intentKey: r.intentKey || undefined,
      similarity: parseFloat(String(r.similarity)),
      mediaPath: r.mediaPath || undefined,
      mediaName: r.mediaName || undefined
    }));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`${SERVICE_PREFIX} Error en búsqueda: ${msg}`);
    return [];
  }
};

/**
 * Construye el bloque de Quick Replies para el Supervisor
 * Se inyecta en el bloque CONTEXTO DISPONIBLE
 */
const buildSupervisorBlock = async (
  currentMessage: string,
  companyId: number
): Promise<string> => {
  const relevant = await findRelevant(currentMessage, companyId);
  return buildSupervisorBlockFromCandidates(relevant);
};

/**
 * Elimina el embedding de un QuickReply (al borrar/deshabilitar)
 */
const removeEmbedding = async (quickMessageId: number): Promise<void> => {
  try {
    await sequelize.query(
      `UPDATE "QuickMessages" SET "intentEmbedding" = NULL WHERE id = :id`,
      { replacements: { id: quickMessageId }, type: QueryTypes.UPDATE }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`${SERVICE_PREFIX} Error eliminando embedding: ${msg}`);
  }
};

export default {
  syncEmbedding,
  findRelevant,
  buildSupervisorBlock,
  buildSupervisorBlockFromCandidates,
  removeEmbedding
};
