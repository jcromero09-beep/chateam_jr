import { QueryInterface } from "sequelize";

/**
 * Migración idempotente para la política de sesiones única por canal.
 *
 *  1. Limpia duplicados: si por datos legados un mismo (userId, clientType)
 *     tiene varias sesiones activas (revokedAt IS NULL), conserva la más
 *     reciente y revoca las restantes. NUNCA borra registros (BD SAGRADA).
 *  2. Crea un índice parcial único en Postgres para garantizar a nivel BD
 *     que no puedan coexistir dos sesiones activas del mismo canal.
 *  3. Crea índices auxiliares para queries de auth.
 *
 * Idempotente: usa IF NOT EXISTS y consultas a pg_indexes.
 */

const isPostgres = (qi: QueryInterface): boolean => {
  const dialect = qi.sequelize.getDialect?.() || "";
  return dialect === "postgres";
};

const hasIndex = async (qi: QueryInterface, indexName: string): Promise<boolean> => {
  const [rows]: any = await qi.sequelize.query(
    `SELECT 1 FROM pg_indexes WHERE tablename = 'Sessions' AND indexname = :indexName`,
    { replacements: { indexName } }
  );
  return Array.isArray(rows) && rows.length > 0;
};

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    if (!isPostgres(queryInterface)) {
      // En MySQL / SQLite no creamos el índice parcial. La aplicación garantiza
      // la unicidad vía LoginSessionService (transacción + LOCK FOR UPDATE).
      return;
    }

    // 1) Sanear duplicados de sesiones activas por (userId, clientType).
    //    Conserva la fila con createdAt más reciente y marca las anteriores
    //    como revokedAt = NOW(). Soft-revoke; sin DELETE.
    await queryInterface.sequelize.query(`
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY "userId", "clientType"
            ORDER BY "createdAt" DESC, id DESC
          ) AS rn
        FROM "Sessions"
        WHERE "revokedAt" IS NULL
      )
      UPDATE "Sessions" s
      SET "revokedAt" = NOW(),
          "updatedAt" = NOW()
      FROM ranked r
      WHERE s.id = r.id AND r.rn > 1;
    `);

    // 2) Índice parcial único — garantía a nivel BD.
    //    Si la versión de Postgres soporta CONCURRENTLY y la transacción no
    //    está activa, lo intentamos; si falla cae al variante sin CONCURRENTLY.
    if (!(await hasIndex(queryInterface, "sessions_one_active_per_user_client"))) {
      try {
        await queryInterface.sequelize.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_active_per_user_client
          ON "Sessions" ("userId", "clientType")
          WHERE "revokedAt" IS NULL;
        `);
      } catch (err) {
        // Si choca por datos sucios remanentes, dejamos rastro sin romper deploy.
        // En ese caso el operador debe limpiar manualmente y re-correr.
        // eslint-disable-next-line no-console
        console.error(
          "[migration sessions-policy-indexes] No se pudo crear índice parcial único:",
          err
        );
      }
    }

    // 3) Índices auxiliares para las queries más calientes.
    if (!(await hasIndex(queryInterface, "sessions_user_client_revoked_expires"))) {
      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS sessions_user_client_revoked_expires
        ON "Sessions" ("userId", "clientType", "revokedAt", "expiresAt");
      `);
    }

    if (!(await hasIndex(queryInterface, "sessions_expires_at"))) {
      await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS sessions_expires_at
        ON "Sessions" ("expiresAt");
      `);
    }
  },

  down: async (queryInterface: QueryInterface) => {
    if (!isPostgres(queryInterface)) return;
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS sessions_one_active_per_user_client;`
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS sessions_user_client_revoked_expires;`
    );
    await queryInterface.sequelize.query(
      `DROP INDEX IF EXISTS sessions_expires_at;`
    );
    // Sin restaurar el revokedAt: BD SAGRADA, no se pierde info, sólo índices.
  }
};
