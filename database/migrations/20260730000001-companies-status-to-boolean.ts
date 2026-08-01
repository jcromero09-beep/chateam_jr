import { QueryInterface } from "sequelize";

/**
 * [Fix schema drift] `Companies.status`: `character varying` → `boolean`.
 *
 * ## El drift
 *
 * `models/Company.ts:56` declara `@Column(DataType.BOOLEAN) status: boolean`,
 * pero la columna real es `character varying`. El modelo lleva mintiendo desde
 * siempre.
 *
 * Consecuencia medida en producción: tres cron jobs
 * (`handleCompanyExpirationAlert`, `[stats.nightly]`, `[calendar]`) hacían
 * `where: { status: true }`, Postgres respondía
 * `operator does not exist: character varying = boolean`, y como la query LANZA
 * **el job entero moría**. Al menos las dos semanas que cubría el log.
 *
 * Y el drift al revés también muerde: como el tipo declarado es `boolean`,
 * `if (company.status)` es truthy con CUALQUIER texto — incluida la cadena
 * `"false"`. Hoy no hay ninguna fila con ese valor; el día que la haya, una
 * empresa desactivada se leería como activa.
 *
 * ## Los datos
 *
 * En producción (2026-07-30) la columna tenía dos convenciones conviviendo:
 *
 *     status = 'true'     16 filas
 *     status = 'active'    1 fila
 *
 * Las dos significan lo mismo. Se normalizan a `true`.
 *
 * ## ⚠️ Cómo aplicarla
 *
 * El runner `npm run db:migrate` está DESINCRONIZADO (ver la migración
 * `20260728000001`): intentaría aplicar todo lo que hay en disco. Aplicar
 * QUIRÚRGICAMENTE por SQL:
 *
 *     BEGIN;
 *     UPDATE "Companies" SET status = 'true'
 *      WHERE lower(coalesce(status,'')) IN ('active','1','t','yes','si','true');
 *     UPDATE "Companies" SET status = 'false'
 *      WHERE status IS NULL OR lower(status) <> 'true';
 *     -- El DEFAULT es 'active'::varchar y Postgres NO puede castearlo solo:
 *     -- sin este DROP, el ALTER falla con
 *     --   default for column "status" cannot be cast automatically to type boolean
 *     ALTER TABLE "Companies" ALTER COLUMN status DROP DEFAULT;
 *     ALTER TABLE "Companies"
 *       ALTER COLUMN status TYPE boolean USING (status::boolean);
 *     ALTER TABLE "Companies" ALTER COLUMN status SET DEFAULT true;
 *     COMMIT;
 *
 * Probada tal cual contra `chateam_test` (clon de esquema): la primera versión,
 * sin el DROP DEFAULT, fallaba. La transacción la revirtió entera — de ahí que
 * el BEGIN/COMMIT no sea decorativo.
 *
 * **Hacer backup antes.** Es un ALTER sobre una tabla de producción; son 17
 * filas, pero el bloqueo es exclusivo mientras dura.
 *
 * ## El código NO depende del orden
 *
 * `backendCronJobs.WHERE_COMPANY_ACTIVE` compara `CAST(status AS text)` contra
 * `('true','active')`, que funciona con la columna en texto Y con la columna ya
 * migrada a boolean (donde el cast da `'true'`/`'false'`). Así da igual si esta
 * migración se aplica antes o después del reinicio: no hay ventana en la que los
 * cron vuelvan a caerse.
 *
 * Una vez aplicada y verificada, ese predicado puede simplificarse a
 * `{ status: true }` y este comentario retirarse.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Companies");
    const current = String(table?.status?.type || "").toUpperCase();
    if (current.includes("BOOLEAN")) return; // ya migrada — idempotente

    const t = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `UPDATE "Companies" SET status = 'true'
          WHERE lower(coalesce(status,'')) IN ('active','1','t','yes','si','true')`,
        { transaction: t }
      );
      // Todo lo que no quedó como 'true' pasa a 'false' explícito: el USING de
      // abajo falla con NULL o con un texto que no sea castable a boolean.
      await queryInterface.sequelize.query(
        `UPDATE "Companies" SET status = 'false'
          WHERE status IS NULL OR lower(status) <> 'true'`,
        { transaction: t }
      );
      // El DEFAULT es 'active'::varchar: Postgres no lo castea solo y el ALTER
      // falla con "default for column status cannot be cast automatically".
      await queryInterface.sequelize.query(
        `ALTER TABLE "Companies" ALTER COLUMN status DROP DEFAULT`,
        { transaction: t }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "Companies"
           ALTER COLUMN status TYPE boolean USING (status::boolean)`,
        { transaction: t }
      );
      await queryInterface.sequelize.query(
        `ALTER TABLE "Companies" ALTER COLUMN status SET DEFAULT true`,
        { transaction: t }
      );
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("Companies");
    const current = String(table?.status?.type || "").toUpperCase();
    if (!current.includes("BOOLEAN")) return;

    await queryInterface.sequelize.query(
      `ALTER TABLE "Companies" ALTER COLUMN status DROP DEFAULT`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE "Companies"
         ALTER COLUMN status TYPE character varying USING (status::text)`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE "Companies" ALTER COLUMN status SET DEFAULT 'active'`
    );
  }
};
