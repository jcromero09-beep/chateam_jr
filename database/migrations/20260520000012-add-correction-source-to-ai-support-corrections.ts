/**
 * Sprint 1 — Loop de Aprendizaje desde Correcciones Humanas (Opción C)
 *
 * Amplía AISupportCorrections con metadatos del origen y prioridad.
 * Esto permite que el bloque de prompt distinga:
 *   - source='admin'                  → creadas manualmente desde panel
 *   - source='human_correction_loop'  → derivadas de correcciones humanas
 *                                       en tickets reales (Sprint 1).
 *   - source='api'                    → integraciones externas
 *   - source='import'                 → carga masiva
 *
 * BD SAGRADA — TODO es ADD COLUMN IF NOT EXISTS. No se modifica ni se borra
 * ninguna columna existente. down() es no-op.
 *
 * Lección aprendida (L-CHATEAMJR-SESSION-POLICY-1-PER-CHANNEL): migraciones
 * que añaden columnas deben ser idempotentes, especialmente cuando varias
 * bases tienen historiales distintos.
 */
import { QueryInterface } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const sequelize = queryInterface.sequelize;
    const dialect = sequelize.getDialect();

    if (dialect !== "postgres") {
      // En este proyecto sólo soportamos Postgres en producción.
      // Para entornos de test con SQLite, no aplicar.
      return;
    }

    // 1) Verificar columnas existentes (defensivo)
    const tableDef = await queryInterface.describeTable("AISupportCorrections");

    // 2) Añadir columnas de origen, scope y verificación
    const additions: Array<{ name: string; sql: string }> = [
      {
        name: "source",
        sql: `ADD COLUMN IF NOT EXISTS source VARCHAR(40) NOT NULL DEFAULT 'admin'`
      },
      {
        name: "correctionType",
        sql: `ADD COLUMN IF NOT EXISTS "correctionType" VARCHAR(40) NULL`
      },
      {
        name: "scopeJson",
        sql: `ADD COLUMN IF NOT EXISTS "scopeJson" JSONB NOT NULL DEFAULT '{}'::jsonb`
      },
      {
        name: "verifiedBy",
        sql: `ADD COLUMN IF NOT EXISTS "verifiedBy" INTEGER NULL REFERENCES "Users"(id) ON DELETE SET NULL`
      },
      {
        name: "verifiedAt",
        sql: `ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMPTZ NULL`
      },
      {
        name: "sourceAgentLogId",
        sql: `ADD COLUMN IF NOT EXISTS "sourceAgentLogId" INTEGER NULL`
      },
      {
        name: "sourceTicketId",
        sql: `ADD COLUMN IF NOT EXISTS "sourceTicketId" INTEGER NULL`
      },
      {
        name: "priority",
        sql: `ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 100`
      },
      {
        name: "embedding",
        // La columna embedding ya puede existir si el equipo la creó antes;
        // creamos sólo si NO existe en describeTable.
        sql: tableDef["embedding"]
          ? ""
          : `ADD COLUMN IF NOT EXISTS embedding vector(1536) NULL`
      }
    ];

    for (const a of additions) {
      if (!a.sql) continue;
      await sequelize.query(`ALTER TABLE "AISupportCorrections" ${a.sql};`);
    }

    // 3) Índices auxiliares (no únicos, defensivos)
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_asc_source
        ON "AISupportCorrections"(source);
      CREATE INDEX IF NOT EXISTS idx_asc_company_active_priority
        ON "AISupportCorrections"("companyId", "isActive", priority);
      CREATE INDEX IF NOT EXISTS idx_asc_correction_type
        ON "AISupportCorrections"("companyId", "correctionType")
        WHERE "correctionType" IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_asc_source_ticket
        ON "AISupportCorrections"("sourceTicketId")
        WHERE "sourceTicketId" IS NOT NULL;
    `);

    // 4) Índice ivfflat para búsqueda semántica si embedding existe.
    //    Idempotente: se omite si el índice ya está creado.
    await sequelize.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'AISupportCorrections' AND column_name = 'embedding'
        ) AND NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE schemaname='public' AND indexname='idx_asc_embedding'
        ) THEN
          EXECUTE 'CREATE INDEX idx_asc_embedding
                   ON "AISupportCorrections" USING ivfflat (embedding vector_cosine_ops)
                   WITH (lists=50)';
        END IF;
      END$$;
    `);
  },

  down: async (): Promise<void> => {
    // BD SAGRADA: no se eliminan columnas. La migración es estrictamente
    // aditiva. Si necesitas revertir el comportamiento, baja el feature flag
    // AI_LEARNING_LEVEL a 0 y los servicios dejan de leer/escribir estos
    // campos, pero las columnas permanecen.
  }
};
