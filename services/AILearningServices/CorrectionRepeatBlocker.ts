/**
 * CorrectionRepeatBlocker — Detecta si el draft del agente repite un error
 * que un humano ya corrigió antes en este companyId/queue/producto.
 *
 * Sprint 1 (2026-05-20) — Loop de Aprendizaje desde Correcciones Humanas.
 *
 * Llamado por ResponseGatekeeperService ANTES del LLM judge para abortar
 * temprano respuestas que repiten errores conocidos.
 *
 * Lógica:
 *   1. Generar embedding del draft.
 *   2. Buscar AISupportCorrections con source='human_correction_loop' o
 *      verifiedAt IS NOT NULL (verificadas por humano), isActive=true,
 *      mismo companyId, scope compatible.
 *   3. Si match semántico draft↔problem >= 0.78 → bloquear con solution.
 *   4. La corrección con mayor score (similitud × especificidad de scope ×
 *      bonus de prioridad) gana.
 *
 * Defensivo:
 *   - Nunca lanza. Si embedding falla, retorna shouldBlock=false.
 *   - Timeout interno corto (no debe sumar >500ms al gatekeeper).
 */

import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import EmbeddingService from "../RAGServices/EmbeddingService";
import logger from "../../utils/logger";
import AILearningFeatureFlag from "./AILearningFeatureFlag";
import CorrectionScopeMatcher, { TurnContext } from "./CorrectionScopeMatcher";

const PREFIX = "[CorrectionRepeatBlocker]";
const SIMILARITY_THRESHOLD = 0.78;
const MAX_CANDIDATES = 5;

export interface CheckInput {
  draft: string;
  turn: TurnContext;
  /** Si tiene tools de DB del turno actual, no bloqueamos (la DB tiene la última palabra). */
  toolsUsedThisTurn?: string[];
}

export interface CheckResult {
  shouldBlock: boolean;
  blockingCorrectionId?: number;
  blockingCorrectionType?: string;
  replacementText?: string;
  similarityScore?: number;
  scopeSpecificity?: number;
  reasoning?: string;
}

interface CandidateRow {
  id: number;
  problem: string;
  solution: string;
  category: string;
  correctionType: string | null;
  scopeJson: Record<string, unknown> | null;
  priority: number;
  source: string;
  similarity: number;
}

// ── Caso de salida temprana sin LLM ─────────────────────────────────

const NO_BLOCK: CheckResult = { shouldBlock: false };

/**
 * Si el agente usó tools de fuente viva (precio actual, agenda, pago, etc.)
 * en este turno, NO bloqueamos: la DB tiene la última palabra y una corrección
 * vieja podría ser obsoleta. Esto evita falsos positivos.
 */
const LIVE_DATA_TOOLS = new Set([
  "get_current_price",
  "check_availability",
  "get_order_status",
  "get_payment_status",
  "get_my_appointments",
  "schedule_appointment",
  "list_products"
]);

const usedLiveDataTool = (tools?: string[]): boolean => {
  if (!tools || tools.length === 0) return false;
  return tools.some(t => LIVE_DATA_TOOLS.has(t));
};

// ── Función principal ───────────────────────────────────────────────

export const check = async (input: CheckInput): Promise<CheckResult> => {
  const { draft, turn, toolsUsedThisTurn } = input;

  if (!AILearningFeatureFlag.isEnabled(turn.companyId)) return NO_BLOCK;
  if (!draft || draft.trim().length < 10) return NO_BLOCK;

  // Si el draft viene respaldado por tool de DB viva, no bloqueamos.
  if (usedLiveDataTool(toolsUsedThisTurn)) {
    logger.debug(`${PREFIX} skip: draft respaldado por tools de DB viva`);
    return NO_BLOCK;
  }

  let embedding: number[] | null = null;
  try {
    embedding = await EmbeddingService.generateEmbedding(draft.slice(0, 2000), turn.companyId);
  } catch (e: any) {
    logger.debug(`${PREFIX} embedding falló (silenciado): ${e.message}`);
    return NO_BLOCK;
  }
  if (!embedding || embedding.length === 0) return NO_BLOCK;

  const embeddingStr = `[${embedding.join(",")}]`;

  try {
    // Buscar correcciones humanas verificadas que matcheen semánticamente.
    // Solo consideramos source='human_correction_loop' (Sprint 1) o
    // verifiedAt IS NOT NULL (admin verificó manualmente).
    const rows = await sequelize.query<CandidateRow>(
      `SELECT id,
              problem,
              solution,
              category,
              "correctionType",
              "scopeJson",
              priority,
              source,
              (1 - (embedding <=> :embedding::vector)) AS similarity
         FROM "AISupportCorrections"
        WHERE "companyId" = :companyId
          AND "isActive" = true
          AND embedding IS NOT NULL
          AND ( source = 'human_correction_loop' OR "verifiedAt" IS NOT NULL )
          AND (1 - (embedding <=> :embedding::vector)) >= :threshold
        ORDER BY embedding <=> :embedding::vector ASC
        LIMIT :limit`,
      {
        replacements: {
          embedding: embeddingStr,
          companyId: turn.companyId,
          threshold: SIMILARITY_THRESHOLD,
          limit: MAX_CANDIDATES
        },
        type: QueryTypes.SELECT
      }
    );

    if (!rows || rows.length === 0) return NO_BLOCK;

    // Filtrar por scope y rankear
    const ranked = rows
      .map(r => {
        const scope = (r.scopeJson || { companyId: turn.companyId }) as any;
        scope.companyId = turn.companyId;
        const scopeMatches = CorrectionScopeMatcher.matches(scope, turn);
        const spec = CorrectionScopeMatcher.specificityScore(scope);
        return { row: r, scope, scopeMatches, specificity: spec };
      })
      .filter(c => c.scopeMatches);

    if (ranked.length === 0) {
      logger.debug(`${PREFIX} ${rows.length} candidatos por similitud pero ninguno con scope match`);
      return NO_BLOCK;
    }

    // Ordenar: mayor similitud × especificidad × inverso de prioridad (menor número = mejor)
    ranked.sort((a, b) => {
      const sa = a.row.similarity * (1 + a.specificity / 10) * (110 - a.row.priority) / 100;
      const sb = b.row.similarity * (1 + b.specificity / 10) * (110 - b.row.priority) / 100;
      return sb - sa;
    });

    const winner = ranked[0];
    const sim = parseFloat(String(winner.row.similarity));

    // Aumentar usageCount asincrónicamente, sin esperar
    void sequelize.query(
      `UPDATE "AISupportCorrections"
          SET "usageCount" = "usageCount" + 1,
              "lastUsedAt" = NOW()
        WHERE id = :id`,
      { replacements: { id: winner.row.id }, type: QueryTypes.UPDATE }
    ).catch(() => { /* silent */ });

    logger.info(
      `${PREFIX} 🚫 BLOCK corrId=${winner.row.id} type=${winner.row.correctionType || winner.row.category} ` +
      `sim=${sim.toFixed(3)} spec=${winner.specificity} prio=${winner.row.priority} company=${turn.companyId}`
    );

    return {
      shouldBlock: true,
      blockingCorrectionId: winner.row.id,
      blockingCorrectionType: winner.row.correctionType || winner.row.category,
      replacementText: winner.row.solution,
      similarityScore: sim,
      scopeSpecificity: winner.specificity,
      reasoning: `Draft repite un error ya corregido por un humano (corrId=${winner.row.id}, similitud=${sim.toFixed(2)})`
    };
  } catch (e: any) {
    logger.warn(`${PREFIX} consulta falló: ${e.message}`);
    return NO_BLOCK;
  }
};

export default { check };
