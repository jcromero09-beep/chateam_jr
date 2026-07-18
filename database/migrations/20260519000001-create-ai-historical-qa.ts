/**
 * AIHistoricalQA — memoria histórica cross-ticket para respuestas a clientes.
 *
 * Mantiene en migraciones el esquema que antes vivía como SQL suelto en
 * database/sql/ai-historical-qa.sql. BD SAGRADA: sólo ADD/idempotente.
 */
import { QueryInterface } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS vector;`);
    await queryInterface.sequelize.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS "AIHistoricalQA" (
        id BIGSERIAL PRIMARY KEY,
        "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON DELETE CASCADE,
        "sourceTicketId" INTEGER,
        "sourceMessageId" INTEGER,
        "sourceContactId" INTEGER,
        "sourceAgentLogId" INTEGER,
        question TEXT NOT NULL,
        "normalizedQuestion" TEXT NOT NULL,
        answer TEXT NOT NULL,
        "answerType" VARCHAR(20) NOT NULL DEFAULT 'ai_verified',
        intent VARCHAR(100),
        language VARCHAR(10) DEFAULT 'es',
        channel VARCHAR(30),
        tags TEXT[] DEFAULT ARRAY[]::TEXT[],
        "productKey" VARCHAR(100),
        embedding vector(1536),
        "usedCount" INTEGER NOT NULL DEFAULT 0,
        "lastUsedAt" TIMESTAMPTZ,
        rating NUMERIC(3,2),
        verified BOOLEAN NOT NULL DEFAULT FALSE,
        superseded BOOLEAN NOT NULL DEFAULT FALSE,
        "supersededBy" BIGINT REFERENCES "AIHistoricalQA"(id) ON DELETE SET NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_historical_qa_company
        ON "AIHistoricalQA"("companyId");
      CREATE INDEX IF NOT EXISTS idx_historical_qa_company_lang
        ON "AIHistoricalQA"("companyId", language, channel);
      CREATE INDEX IF NOT EXISTS idx_historical_qa_norm
        ON "AIHistoricalQA"("companyId", "normalizedQuestion");
      CREATE INDEX IF NOT EXISTS idx_historical_qa_product
        ON "AIHistoricalQA"("companyId", "productKey");
      CREATE INDEX IF NOT EXISTS idx_historical_qa_verified
        ON "AIHistoricalQA"("companyId", verified, superseded);
      CREATE INDEX IF NOT EXISTS idx_historical_qa_tags
        ON "AIHistoricalQA" USING GIN (tags);
      CREATE INDEX IF NOT EXISTS idx_historical_qa_trgm
        ON "AIHistoricalQA" USING GIN ("normalizedQuestion" gin_trgm_ops);
    `);

    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE schemaname='public' AND indexname='idx_historical_qa_embedding'
        ) THEN
          EXECUTE 'CREATE INDEX idx_historical_qa_embedding
                   ON "AIHistoricalQA" USING ivfflat (embedding vector_cosine_ops)
                   WITH (lists=100)';
        END IF;
      END$$;
    `);

    await queryInterface.sequelize.query(`
      CREATE OR REPLACE FUNCTION touch_historical_qa_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW."updatedAt" := NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_historical_qa_touch ON "AIHistoricalQA";
      CREATE TRIGGER trg_historical_qa_touch
        BEFORE UPDATE ON "AIHistoricalQA"
        FOR EACH ROW EXECUTE FUNCTION touch_historical_qa_updated_at();
    `);
  },

  down: async (): Promise<void> => {
    // BD SAGRADA: no destruir memoria histórica ni índices.
  }
};
