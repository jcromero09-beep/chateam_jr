/**
 * Fix idempotente para `column "flowState" does not exist` y demás columnas
 * añadidas por la migración 20260507100001-add-flow-and-followup-to-tickets.
 *
 * Causa raíz: la migración existe en repo pero nunca se aplicó ni se registró
 * en `SequelizeMeta`. El modelo `Ticket` ya las declara y los servicios las
 * consultan en SELECT.
 *
 * Aplica las columnas + índices con `IF NOT EXISTS` (idempotente, BD SAGRADA).
 *
 * Uso:
 *   npx tsx scripts/fixFlowAndFollowupColumns.ts
 */
import "dotenv/config";
import { Sequelize } from "sequelize";

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || 5432);
const DB_NAME = process.env.DB_NAME || "chateamjr";
const DB_USER = process.env.DB_USER || "atendimento";
const DB_PASS = process.env.DB_PASS || "";

const TABLE = "Tickets";
const MIGRATION = "20260507100001-add-flow-and-followup-to-tickets.js";

interface ColSpec {
  name: string;
  ddl: string; // tipo + nullability + default sin el ADD COLUMN
  comment: string;
}

// Mismas definiciones que la migración del repo, traducidas a SQL crudo.
const COLUMNS: ColSpec[] = [
  {
    name: "flowState",
    ddl: `VARCHAR(50) NULL DEFAULT 'intake'`,
    comment: "Estado actual del flujo IA"
  },
  {
    name: "flowStep",
    ddl: `INTEGER NOT NULL DEFAULT 0`,
    comment: "Paso numérico dentro del flowState"
  },
  {
    name: "flowMetadata",
    ddl: `JSONB NULL DEFAULT '{}'::jsonb`,
    comment: "Metadatos del flujo IA"
  },
  {
    name: "nextFollowupAt",
    ddl: `TIMESTAMP WITH TIME ZONE NULL`,
    comment: "Próximo timestamp para enviar seguimiento automático"
  },
  {
    name: "lastFollowupAt",
    ddl: `TIMESTAMP WITH TIME ZONE NULL`,
    comment: "Último timestamp en que se envió un seguimiento automático"
  },
  {
    name: "followupReason",
    ddl: `VARCHAR(100) NULL`,
    comment: "Razón del seguimiento programado"
  }
];

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS "tickets_followup_due_idx"
     ON "Tickets" ("nextFollowupAt", "followupEnabled", "status")
     WHERE "nextFollowupAt" IS NOT NULL AND "followupEnabled" = true`,
  `CREATE INDEX IF NOT EXISTS "tickets_flow_state_idx"
     ON "Tickets" ("companyId", "flowState", "status")`
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
    console.error("❌ No se pudo conectar:", err?.message || err);
    process.exit(1);
  }

  const [tableRows]: any = await sequelize.query(
    `SELECT to_regclass(:t) AS exists`,
    { replacements: { t: `public."${TABLE}"` } }
  );
  if (!tableRows[0]?.exists) {
    console.error(`❌ La tabla "${TABLE}" no existe.`);
    await sequelize.close();
    process.exit(1);
  }

  // Columnas existentes
  const [colRows]: any = await sequelize.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = :t`,
    { replacements: { t: TABLE } }
  );
  const existing = new Set<string>(colRows.map((r: any) => r.column_name));

  console.log(`📂 Tabla: ${TABLE} | columnas existentes: ${existing.size}`);
  console.log("─".repeat(72));

  let created = 0;
  let okCount = 0;

  for (const col of COLUMNS) {
    if (existing.has(col.name)) {
      console.log(`  [OK]  ${col.name.padEnd(18)} — ya existe`);
      okCount += 1;
      continue;
    }
    try {
      const sql = `ALTER TABLE "${TABLE}" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.ddl}`;
      await sequelize.query(sql);
      console.log(`  [+]   ${col.name.padEnd(18)} — creada (${col.comment})`);
      created += 1;
    } catch (err: any) {
      console.error(`  [✗]   ${col.name.padEnd(18)} — ERROR: ${err?.message || err}`);
      await sequelize.close();
      process.exit(1);
    }
  }

  // Índices
  console.log("─".repeat(72));
  for (const idxSql of INDEXES) {
    try {
      await sequelize.query(idxSql);
      const match = idxSql.match(/IF NOT EXISTS "([^"]+)"/);
      console.log(`  [idx] ${match ? match[1] : "(?)"} — verificado`);
    } catch (err: any) {
      console.error(`  [✗] índice — ERROR: ${err?.message || err}`);
    }
  }

  // SequelizeMeta
  console.log("─".repeat(72));
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

  console.log(`📊 Resultado: ${okCount} ya existían | ${created} creadas`);
  if (created > 0) {
    console.log("\n🎉 Tabla Tickets actualizada. Reinicia backend:");
    console.log("    pm2 restart node-1 node-2");
  } else {
    console.log("\nℹ️  Ningún cambio aplicado.");
  }

  await sequelize.close();
  process.exit(0);
};

main().catch(err => {
  console.error("Error fatal:", err);
  process.exit(1);
});
