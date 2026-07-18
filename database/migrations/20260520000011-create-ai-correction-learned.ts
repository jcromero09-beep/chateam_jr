/**
 * Sprint 1 — Loop de Aprendizaje desde Correcciones Humanas (Opción C)
 *
 * Crea AICorrectionLearned: bitácora auditable de TODAS las correcciones
 * humanas detectadas, sean auto-aplicadas, enviadas a revisión o descartadas.
 *
 * Diseño:
 *   - Multi-tenant: companyId NOT NULL + índice (companyId, outcome).
 *   - Aditiva: no toca tablas existentes.
 *   - Idempotente: CREATE TABLE/INDEX IF NOT EXISTS.
 *   - Trazabilidad cruzada:
 *       * supportCorrectionId → fila creada en AISupportCorrections (si auto-aplicada o aprobada).
 *       * reviewQueueId       → fila en AICorrectionReviewQueue (si fue a revisión).
 *       * supersededQaId      → fila AIHistoricalQA marcada superseded.
 *
 * outcome ∈ {
 *   auto_applied        — auto-aprendida sin revisión humana (no crítica)
 *   sent_to_review      — enviada a panel de revisión (crítica o baja confianza)
 *   approved_by_human   — aprobada por humano desde panel (crea AISupportCorrection)
 *   rejected_by_human   — rechazada en panel
 *   expired             — no revisada en 30 días → expirada
 *   skipped_not_correction — el clasificador dijo que no era corrección
 *   skipped_low_quality    — la corrección era ruido (texto muy corto, etc.)
 *   skipped_duplicate      — ya existe AISupportCorrection idéntica
 * }
 *
 * BD SAGRADA — defensivo: down() NO destruye auditoría.
 */
import { QueryInterface } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS "AICorrectionLearned" (
        id SERIAL PRIMARY KEY,
        "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON DELETE CASCADE,
        "ticketId" INTEGER NULL,
        "aiAgentLogId" INTEGER NULL,
        "supportCorrectionId" INTEGER NULL REFERENCES "AISupportCorrections"(id) ON DELETE SET NULL,
        "reviewQueueId" INTEGER NULL REFERENCES "AICorrectionReviewQueue"(id) ON DELETE SET NULL,
        "supersededQaId" BIGINT NULL,
        "correctionType" VARCHAR(40) NOT NULL,
        "wrongAiClaim" TEXT NULL,
        "correctHumanClaim" TEXT NULL,
        scope JSONB NOT NULL DEFAULT '{}'::jsonb,
        outcome VARCHAR(30) NOT NULL,
        "classifierConfidence" NUMERIC(3,2) NOT NULL DEFAULT 0,
        "appliedBy" INTEGER NULL REFERENCES "Users"(id) ON DELETE SET NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_acl_company_outcome
        ON "AICorrectionLearned"("companyId", outcome);
      CREATE INDEX IF NOT EXISTS idx_acl_ticket
        ON "AICorrectionLearned"("ticketId") WHERE "ticketId" IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_acl_log
        ON "AICorrectionLearned"("aiAgentLogId") WHERE "aiAgentLogId" IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_acl_type
        ON "AICorrectionLearned"("companyId", "correctionType");
      CREATE INDEX IF NOT EXISTS idx_acl_created
        ON "AICorrectionLearned"("createdAt" DESC);
    `);

    // Índice único defensivo: no procesar dos veces el mismo aiAgentLogId.
    // Permite NULL en aiAgentLogId (correcciones sin log explícito).
    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_acl_aiagentlog_outcome
        ON "AICorrectionLearned"("aiAgentLogId", outcome)
        WHERE "aiAgentLogId" IS NOT NULL AND outcome != 'pending';
    `);
  },

  down: async (): Promise<void> => {
    // BD SAGRADA: no destruir bitácora de aprendizaje.
  }
};
