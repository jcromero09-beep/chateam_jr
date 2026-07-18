import { QueryInterface } from "sequelize";

/**
 * Alinea el default de Whatsapps.sendChannel a 'meta' (Meta principal en
 * coexistencia) para que UI y runtime coincidan.
 *
 * BD SAGRADA: sólo ALTER COLUMN ... SET DEFAULT (no DROP) y UPDATE acotado.
 * Sólo toca filas en coexistencia cuyo sendChannel quedó NULL (estado
 * inconsistente) — NO sobreescribe una elección explícita de 'baileys'.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const dialect = queryInterface.sequelize.getDialect();

    // 1) Cambiar el DEFAULT a nivel BD (Postgres).
    if (dialect === "postgres") {
      await queryInterface.sequelize.query(
        `ALTER TABLE "Whatsapps" ALTER COLUMN "sendChannel" SET DEFAULT 'meta'`
      );
    }

    // 2) Backfill SOLO de filas en coexistencia con sendChannel nulo
    //    (no toca quien ya eligió 'baileys' o 'meta' explícitamente).
    await queryInterface.sequelize.query(
      `UPDATE "Whatsapps"
         SET "sendChannel" = 'meta'
       WHERE "coexistenceEnabled" = true
         AND ("sendChannel" IS NULL OR "sendChannel" = '')`
    );
  },

  down: async (_queryInterface: QueryInterface) => {
    // BD SAGRADA: no se revierte (no DROP, no restaurar defaults destructivos).
  }
};
