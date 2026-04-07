/**
 * CorrectionSearchService — Búsqueda semántica de correcciones/soluciones
 *
 * El orquestador consulta esta tabla ANTES de responder para verificar si
 * existe una corrección manual que aplique al problema del cliente.
 * Las correcciones tienen MAYOR PRIORIDAD que el RAG.
 *
 * Flujo:
 * 1. Admin crea corrección: {problem, solution, category}
 * 2. Se genera embedding del problem
 * 3. Al llegar mensaje, se busca por similitud semántica
 * 4. Si score >= 0.60 → se inyecta como contexto prioritario
 */

import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import EmbeddingService from "../RAGServices/EmbeddingService";
import logger from "../../utils/logger";

const SERVICE_PREFIX = "[CorrectionSearch]";
const DEFAULT_THRESHOLD = 0.60;
const MAX_CORRECTIONS = 3;

export interface MatchedCorrection {
  id: number;
  problem: string;
  solution: string;
  category: string;
  similarity: number;
}

/**
 * Busca correcciones relevantes para el mensaje actual
 */
const findRelevant = async (
  message: string,
  companyId: number,
  threshold: number = DEFAULT_THRESHOLD
): Promise<MatchedCorrection[]> => {
  if (!message || message.trim().length < 3) return [];

  try {
    const queryEmbedding = await EmbeddingService.generateEmbedding(message, companyId);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    const sql = `
      SELECT
        id,
        problem,
        solution,
        category,
        (1 - (embedding <=> :embedding::vector)) AS similarity
      FROM "AISupportCorrections"
      WHERE "companyId" = :companyId
        AND "isActive" = true
        AND embedding IS NOT NULL
        AND (1 - (embedding <=> :embedding::vector)) >= :threshold
      ORDER BY embedding <=> :embedding::vector ASC
      LIMIT :limit
    `;

    const results = await sequelize.query<{
      id: number;
      problem: string;
      solution: string;
      category: string;
      similarity: number;
    }>(sql, {
      replacements: { embedding: embeddingStr, companyId, threshold, limit: MAX_CORRECTIONS },
      type: QueryTypes.SELECT
    });

    if (results.length > 0) {
      logger.info(
        `${SERVICE_PREFIX} ${results.length} correcciones encontradas para "${message.substring(0, 40)}..." ` +
        `(best=${Number(results[0].similarity).toFixed(3)})`
      );

      // Incrementar uso
      const ids = results.map(r => r.id);
      await sequelize.query(
        `UPDATE "AISupportCorrections" SET "usageCount" = "usageCount" + 1, "lastUsedAt" = NOW() WHERE id IN (:ids)`,
        { replacements: { ids }, type: QueryTypes.UPDATE }
      );
    } else {
      logger.debug(`${SERVICE_PREFIX} Sin correcciones para "${message.substring(0, 40)}..."`);
    }

    return results.map(r => ({
      id: r.id,
      problem: r.problem,
      solution: r.solution,
      category: r.category,
      similarity: parseFloat(String(r.similarity))
    }));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`${SERVICE_PREFIX} Error: ${msg}`);
    return [];
  }
};

/**
 * Construye bloque de correcciones para el prompt del Supervisor
 * Tiene MAYOR PRIORIDAD que el RAG
 */
const buildSupervisorBlock = async (
  message: string,
  companyId: number
): Promise<string> => {
  const corrections = await findRelevant(message, companyId);
  if (corrections.length === 0) return "";

  const lines = [
    `## 🔧 CORRECCIONES VERIFICADAS (PRIORIDAD MÁXIMA)`,
    `Estas son soluciones verificadas por el equipo. USA ESTAS respuestas en lugar de generar nuevas:`,
    ``
  ];

  corrections.forEach((c, i) => {
    lines.push(
      `**Problema ${i + 1}:** ${c.problem}`,
      `**Solución verificada:** ${c.solution}`,
      ``
    );
  });

  return lines.join("\n");
};

/**
 * Genera embedding para una corrección (al crear/editar)
 */
const syncEmbedding = async (correctionId: number, companyId: number): Promise<void> => {
  try {
    const AISupportCorrection = require("../../models/AISupportCorrection").default;
    const correction = await AISupportCorrection.findByPk(correctionId);
    if (!correction) return;

    // Generar embedding del problem + solution combinados para mejor matching
    const textToEmbed = `${correction.problem} ${correction.solution}`;
    const embedding = await EmbeddingService.generateEmbedding(textToEmbed, companyId);

    await sequelize.query(
      `UPDATE "AISupportCorrections" SET embedding = :embedding::vector WHERE id = :id`,
      {
        replacements: { embedding: `[${embedding.join(",")}]`, id: correctionId },
        type: QueryTypes.UPDATE
      }
    );

    logger.info(`${SERVICE_PREFIX} Embedding generado para corrección ${correctionId}`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`${SERVICE_PREFIX} Error generando embedding: ${msg}`);
  }
};

export default {
  findRelevant,
  buildSupervisorBlock,
  syncEmbedding
};
