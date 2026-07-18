import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

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
  /** Sprint 1: origen ('admin' | 'human_correction_loop' | 'api' | 'import') */
  source?: string;
  /** Sprint 1: prioridad — menor = más relevante */
  priority?: number;
  /** Sprint 1: true si fue verificada por humano (verifiedAt IS NOT NULL) */
  verifiedByHuman?: boolean;
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

    // Sprint 1 (2026-05-20): incluir source/priority/verifiedAt para que el
    // bloque de prompt marque visiblemente correcciones del loop de aprendizaje
    // y respete prioridades. Las columnas pueden no existir en bases antiguas
    // — usamos COALESCE/EXISTS defensivos para mantener compatibilidad.
    const sql = `
      SELECT
        id,
        problem,
        solution,
        category,
        COALESCE(source, 'admin') AS source,
        COALESCE(priority, 100) AS priority,
        CASE WHEN "verifiedAt" IS NOT NULL THEN true ELSE false END AS "verifiedByHuman",
        (1 - (embedding <=> :embedding::vector)) AS similarity
      FROM "AISupportCorrections"
      WHERE "companyId" = :companyId
        AND "isActive" = true
        AND embedding IS NOT NULL
        AND (1 - (embedding <=> :embedding::vector)) >= :threshold
      ORDER BY
        COALESCE(priority, 100) ASC,
        embedding <=> :embedding::vector ASC
      LIMIT :limit
    `;

    const results = await sequelize.query<{
      id: number;
      problem: string;
      solution: string;
      category: string;
      source: string;
      priority: number;
      verifiedByHuman: boolean;
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
      similarity: parseFloat(String(r.similarity)),
      source: r.source,
      priority: r.priority,
      verifiedByHuman: r.verifiedByHuman
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
    `Estas son soluciones verificadas por el equipo. USA ESTAS respuestas en lugar de generar nuevas.`,
    `Si una de estas correcciones aplica, NO INVENTES otra respuesta — usa la solución verificada.`,
    ``
  ];

  corrections.forEach((c, i) => {
    // Sprint 1: marcador visible para correcciones del loop de aprendizaje.
    const isFromHumanLoop = c.source === "human_correction_loop" || c.verifiedByHuman;
    const badge = isFromHumanLoop
      ? `🛑 ESTE ERROR YA FUE CORREGIDO POR UN HUMANO — NO LO REPITAS`
      : `✅ Corrección verificada`;
    lines.push(
      `**${badge}**`,
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
