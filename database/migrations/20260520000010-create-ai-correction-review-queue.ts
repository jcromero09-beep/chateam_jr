/**
 * Sprint 1 — Loop de Aprendizaje desde Correcciones Humanas (Opción C)
 *
 * Crea AICorrectionReviewQueue: cola de correcciones humanas que tocan
 * datos críticos (price/payment/appointment/status/contract/availability)
 * y exigen aprobación humana antes de convertirse en regla activa.
 *
 * Diseño:
 *   - Multi-tenant: companyId NOT NULL + índice (companyId, status).
 *   - Aditiva: no toca tablas existentes.
 *   - Idempotente: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
 *   - Estado finito: pending|approved|rejected|expired.
 *   - Auditoría: reviewedBy/reviewedAt/reviewNotes.
 *
 * BD SAGRADA — defensivo: down() NO destruye datos.
 */
import { QueryInterface } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS "AICorrectionReviewQueue" (
        id SERIAL PRIMARY KEY,
        "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON DELETE CASCADE,
        "ticketId" INTEGER NULL,
        "contactId" INTEGER NULL,
        "aiAgentLogId" INTEGER NULL,
        "queueId" INTEGER NULL,
        "correctionType" VARCHAR(40) NOT NULL,
        "wrongAiClaim" TEXT NULL,
        "correctHumanClaim" TEXT NULL,
        entity VARCHAR(120) NULL,
        field VARCHAR(60) NULL,
        scope JSONB NOT NULL DEFAULT '{}'::jsonb,
        "classifierConfidence" NUMERIC(3,2) NOT NULL DEFAULT 0,
        "classifierJson" JSONB NOT NULL DEFAULT '{}'::jsonb,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        "reviewedBy" INTEGER NULL REFERENCES "Users"(id) ON DELETE SET NULL,
        "reviewedAt" TIMESTAMPTZ NULL,
        "reviewNotes" TEXT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_acrq_company_status
        ON "AICorrectionReviewQueue"("companyId", status);
      CREATE INDEX IF NOT EXISTS idx_acrq_ticket
        ON "AICorrectionReviewQueue"("ticketId") WHERE "ticketId" IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_acrq_type
        ON "AICorrectionReviewQueue"("companyId", "correctionType");
      CREATE INDEX IF NOT EXISTS idx_acrq_created
        ON "AICorrectionReviewQueue"("createdAt" DESC);
    `);

    // Trigger updatedAt
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION touch_acrq_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW."updatedAt" := NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_acrq_touch ON "AICorrectionReviewQueue";
      CREATE TRIGGER trg_acrq_touch
        BEFORE UPDATE ON "AICorrectionReviewQueue"
        FOR EACH ROW EXECUTE FUNCTION touch_acrq_updated_at();
    `);
  },

  down: async (): Promise<void> => {
    // BD SAGRADA: no destruir cola de revisión humana.
  }
};
