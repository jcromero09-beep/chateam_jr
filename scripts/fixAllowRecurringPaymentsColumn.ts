/**
 * Fix idempotente para el bug `column "allowRecurringPayments" does not exist`
 * en queries SELECT de la tabla `Plans`.
 *
 * Causa raíz: la migración `20260428000001-add-allow-recurring-payments-to-plans.ts`
 * existe en el repo y el modelo `models/Plan.ts` declara `@Column allowRecurringPayments`,
 * pero la migración nunca se aplicó en este servidor (ni en SequelizeMeta).
 *
 * Este script:
 *   1. Conecta a PostgreSQL
 *   2. Verifica que la tabla `Plans` exista (BD SAGRADA: nunca crearla)
 *   3. Agrega la columna `allowRecurringPayments` BOOLEAN NOT NULL DEFAULT FALSE
 *      con `ADD COLUMN IF NOT EXISTS` (idempotente)
 *   4. Marca la migración como aplicada en `SequelizeMeta` para evitar que
 *      `runMigrations.ts` la re-aplique en el futuro
 *
 * Uso:
 *   npx tsx scripts/fixAllowRecurringPaymentsColumn.ts
 */
import "dotenv/config";
import { Sequelize } from "sequelize";

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || 5432);
const DB_NAME = process.env.DB_NAME || "chateamjr";
const DB_USER = process.env.DB_USER || "atendimento";
const DB_PASS = process.env.DB_PASS || "";

const TABLE = "Plans";
const COLUMN = "allowRecurringPayments";
const MIGRATION = "20260428000001-add-allow-recurring-payments-to-plans.js";

const main = async () => {
  const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
    host: DB_HOST,
    port: DB_PORT,
    dialect: "postgres",
    logging: false
  });

  try {
    await sequelize.authenticate();
    console.log("✅ Conectado a PostgreSQL", `${DB_HOST}:${DB_PORT}/${DB_NAME}`);
  } catch (err: any) {
    console.error("❌ No se pudo conectar:", err?.message || err);
    process.exit(1);
  }

  // 1) Verificar tabla
  const [tableRows]: any = await sequelize.query(
    `SELECT to_regclass(:t) AS exists`,
    { replacements: { t: `public."${TABLE}"` } }
  );
  if (!tableRows[0]?.exists) {
    console.error(`❌ La tabla "${TABLE}" no existe.`);
    await sequelize.close();
    process.exit(1);
  }

  // 2) Verificar columna actual
  const [colRows]: any = await sequelize.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = :t AND column_name = :c`,
    { replacements: { t: TABLE, c: COLUMN } }
  );

  if (colRows.length > 0) {
    console.log(`  [OK]  ${TABLE}.${COLUMN} ya existe`);
  } else {
    try {
      await sequelize.query(
        `ALTER TABLE "${TABLE}" ADD COLUMN IF NOT EXISTS "${COLUMN}" BOOLEAN NOT NULL DEFAULT FALSE`
      );
      console.log(`  [+]   ${TABLE}.${COLUMN} BOOLEAN NOT NULL DEFAULT FALSE — creada`);
    } catch (err: any) {
      console.error(`  [✗]   ${TABLE}.${COLUMN} — ERROR: ${err?.message || err}`);
      await sequelize.close();
      process.exit(1);
    }
  }

  // 3) Sincronizar SequelizeMeta
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS "SequelizeMeta" ("name" VARCHAR(255) NOT NULL PRIMARY KEY)`
  );
  const [metaRows]: any = await sequelize.query(
    `SELECT name FROM "SequelizeMeta" WHERE name = :n`,
    { replacements: { n: MIGRATION } }
  );
  if (metaRows.length === 0) {
    await sequelize.query(
      `INSERT INTO "SequelizeMeta" ("name") VALUES (:n) ON CONFLICT DO NOTHING`,
      { replacements: { n: MIGRATION } }
    );
    console.log(`📝 SequelizeMeta: ${MIGRATION} registrada como aplicada`);
  } else {
    console.log(`📝 SequelizeMeta: ${MIGRATION} ya estaba registrada`);
  }

  console.log("\n🎉 Fix aplicado. Reinicia backend para limpiar la caché del modelo:");
  console.log("    pm2 restart node-1 node-2");

  await sequelize.close();
  process.exit(0);
};

main().catch(err => {
  console.error("Error fatal:", err);
  process.exit(1);
});
