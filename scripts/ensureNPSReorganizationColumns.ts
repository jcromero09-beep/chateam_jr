/**
 * Verificador idempotente de columnas BD para la reorganización NPS / Mensajes
 * por conexión (UnifiedConnectionModal + Settings 02-Mar-2026).
 *
 * Asegura que la tabla `Whatsapps` tenga TODAS las columnas que el frontend y
 * backend ahora envían/persisten. Solo usa `ADD COLUMN IF NOT EXISTS`, nunca
 * borra ni modifica datos existentes (regla BD SAGRADA).
 *
 * Columnas verificadas:
 *   • farewellMessage      TEXT     NULL  default ''
 *   • npsEnabled           BOOLEAN  NULL  default NULL  (override global)
 *   • acceptAudio          BOOLEAN  NULL  default NULL  (override global)
 *   • callRejectMessage    TEXT     NULL  default ''
 *   • rejectAudioMessage   TEXT     NULL  default ''
 *
 * Uso:
 *   npx tsx scripts/ensureNPSReorganizationColumns.ts
 *   # o tras compilar:
 *   node dist/scripts/ensureNPSReorganizationColumns.js
 *
 * Salida:
 *   - Lista cada columna con estado [OK existe] o [+ creada]
 *   - Exit code 0 si todo correcto, 1 si falla la conexión o un ALTER
 */
import "dotenv/config";
import { Sequelize } from "sequelize";

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || 5432);
const DB_NAME = process.env.DB_NAME || "chateamjr";
const DB_USER = process.env.DB_USER || "atendimento";
const DB_PASS = process.env.DB_PASS || "";

interface ColumnSpec {
  name: string;
  type: string;
  default: string;
  comment: string;
}

const TABLE = "Whatsapps";

const REQUIRED_COLUMNS: ColumnSpec[] = [
  {
    name: "farewellMessage",
    type: "TEXT",
    default: "''",
    comment: "Mensaje de despedida por conexión (UnifiedConnectionModal → Mensajes)"
  },
  {
    name: "npsEnabled",
    type: "BOOLEAN",
    default: "NULL",
    comment: "Override del switch global Settings.userRating. NULL=heredar"
  },
  {
    name: "acceptAudio",
    type: "BOOLEAN",
    default: "NULL",
    comment: "Override del switch global Settings.acceptAudioMessageContact. NULL=heredar"
  },
  {
    name: "callRejectMessage",
    type: "TEXT",
    default: "''",
    comment: "Mensaje al cliente cuando se rechaza una llamada entrante"
  },
  {
    name: "rejectAudioMessage",
    type: "TEXT",
    default: "''",
    comment: "Mensaje al cliente cuando esta conexión no acepta audios"
  }
];

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
    console.error("❌ No se pudo conectar a PostgreSQL:", err?.message || err);
    process.exit(1);
  }

  // Verificar que la tabla exista (BD SAGRADA: nunca crearla aquí)
  const [tableRows]: any = await sequelize.query(
    `SELECT to_regclass(:tableName) AS exists`,
    { replacements: { tableName: `public."${TABLE}"` } }
  );
  if (!tableRows[0]?.exists) {
    console.error(`❌ La tabla "${TABLE}" no existe. Aborta — primero ejecuta runMigrations.`);
    await sequelize.close();
    process.exit(1);
  }

  // Listar columnas actuales
  const [colRows]: any = await sequelize.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = :tableName`,
    { replacements: { tableName: TABLE } }
  );
  const existing = new Set<string>(colRows.map((r: any) => r.column_name));

  console.log(`📂 Tabla: ${TABLE} | Columnas existentes: ${existing.size}`);
  console.log("─".repeat(72));

  let created = 0;
  let okCount = 0;

  for (const col of REQUIRED_COLUMNS) {
    if (existing.has(col.name)) {
      console.log(`  [OK]  ${col.name.padEnd(22)} ${col.type.padEnd(8)} — ya existe`);
      okCount += 1;
      continue;
    }
    try {
      const sql = `ALTER TABLE "${TABLE}" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type} DEFAULT ${col.default}`;
      await sequelize.query(sql);
      console.log(`  [+]   ${col.name.padEnd(22)} ${col.type.padEnd(8)} — creada (${col.comment})`);
      created += 1;
    } catch (err: any) {
      console.error(`  [✗]   ${col.name.padEnd(22)} — ERROR: ${err?.message || err}`);
      await sequelize.close();
      process.exit(1);
    }
  }

  console.log("─".repeat(72));
  console.log(`📊 Resultado: ${okCount} ya existían | ${created} creadas`);

  // Sincronizar SequelizeMeta para evitar que runMigrations re-aplique la
  // migración relacionada (20260427000002-add-message-permissions-to-whatsapps).
  // Si las columnas existen, la migración está efectivamente aplicada.
  const RELATED_MIGRATION = "20260427000002-add-message-permissions-to-whatsapps.js";
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS "SequelizeMeta" ("name" VARCHAR(255) NOT NULL PRIMARY KEY)`
  );
  const [metaRows]: any = await sequelize.query(
    `SELECT name FROM "SequelizeMeta" WHERE name = :name`,
    { replacements: { name: RELATED_MIGRATION } }
  );
  if (metaRows.length === 0) {
    await sequelize.query(
      `INSERT INTO "SequelizeMeta" ("name") VALUES (:name) ON CONFLICT DO NOTHING`,
      { replacements: { name: RELATED_MIGRATION } }
    );
    console.log(`📝 SequelizeMeta: ${RELATED_MIGRATION} registrada como aplicada`);
  } else {
    console.log(`📝 SequelizeMeta: ${RELATED_MIGRATION} ya estaba registrada`);
  }

  if (created === 0) {
    console.log("ℹ️  Ningún cambio de schema aplicado. La tabla ya está alineada con la UI.");
  } else {
    console.log("🎉 Tabla Whatsapps actualizada. Reinicia backend con: pm2 restart chateam-backend");
  }

  await sequelize.close();
  process.exit(0);
};

main().catch((err) => {
  console.error("Error fatal en ensureNPSReorganizationColumns:", err);
  process.exit(1);
});
