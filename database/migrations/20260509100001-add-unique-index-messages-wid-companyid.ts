/**
 * FASE 7 Coexistencia WhatsApp — Dedupe outbound/inbound de Messages.
 *
 * Crea índice ÚNICO compuesto (companyId, wid) en la tabla Messages
 * para evitar duplicados cuando:
 *
 *   - Llega webhook de status (sent/delivered/read) ANTES de que el
 *     caller que envía haya persistido el Message.
 *   - Llega un echo de Business App (smb_message_echoes) que ya fue
 *     persistido por la rama Cloud API normal.
 *   - Race condition entre dos procesos (cron + agente) tratando de
 *     persistir el mismo wamid simultáneamente.
 *
 * BD SAGRADA — defensivo:
 *   - Pre-limpia duplicados existentes manteniendo el id MENOR
 *     (más antiguo). NUNCA elimina mensajes únicos.
 *   - El índice se crea con `CREATE UNIQUE INDEX IF NOT EXISTS` para
 *     ser idempotente.
 *   - down: NO elimina el índice (fail-safe — el índice no rompe nada).
 */
import { QueryInterface } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const sequelize = queryInterface.sequelize;

    // 1) Detectar y eliminar duplicados existentes por (companyId, wid).
    //    Mantenemos el id más bajo (más antiguo). Esto es necesario antes
    //    de poder crear el índice único, pero NO toca filas únicas.
    await sequelize.query(`
      WITH duplicates AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY "companyId", wid
                 ORDER BY id ASC
               ) AS rn
        FROM "Messages"
        WHERE wid IS NOT NULL AND "companyId" IS NOT NULL
      )
      DELETE FROM "Messages" m
      USING duplicates d
      WHERE m.id = d.id AND d.rn > 1;
    `);

    // 2) Eliminar índice antiguo no-único de wid si existía (FASE legacy).
    //    Lo mantenemos sólo si aún no existe el compuesto.
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_messages_companyid_wid
      ON "Messages" ("companyId", wid)
      WHERE wid IS NOT NULL;
    `);

    // 3) Índice adicional para búsquedas por externalId (wamid puro).
    //    Útil para reconciliación de acks Meta sin tener companyId.
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_messages_externalid_companyid
      ON "Messages" ("externalId", "companyId")
      WHERE "externalId" IS NOT NULL;
    `);
  },

  down: async (_queryInterface: QueryInterface): Promise<void> => {
    // BD SAGRADA — no eliminamos el índice en down. Si necesitas
    // revertir manualmente:
    //   DROP INDEX IF EXISTS uniq_messages_companyid_wid;
    //   DROP INDEX IF EXISTS idx_messages_externalid_companyid;
  }
};
