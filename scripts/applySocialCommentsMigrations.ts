/**
 * Aplicación DIRIGIDA de las 3 migraciones del módulo Comentarios FB/IG.
 *
 * Motivo: SequelizeMeta está desincronizada (25 registros vs 365 archivos),
 * por lo que el runner global aplicaría migraciones históricas destructivas.
 * Este script aplica SOLO las 3 migraciones nuevas (CREATE TABLE / ADD COLUMN,
 * 100% aditivas e idempotentes) y las registra en SequelizeMeta.
 *
 * BD SAGRADA: sin DROP, sin DELETE, sin TRUNCATE.
 *
 * Uso:
 *   npx tsx scripts/applySocialCommentsMigrations.ts
 */
import "dotenv/config";
import { Sequelize, QueryTypes } from "sequelize";

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || 5432);
const DB_NAME = process.env.DB_NAME || "chateamjr";
const DB_USER = process.env.DB_USER || "atendimento";
const DB_PASS = process.env.DB_PASS || "";

const MIGRATIONS = [
  "20260612100000-create-comment-response-settings.js",
  "20260612100001-add-page-token-to-whatsapps.js",
  "20260612100002-add-moderation-flags-to-ugc-post-comments.js"
];

const run = async (): Promise<void> => {
  const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASS, {
    host: DB_HOST,
    port: DB_PORT,
    dialect: "postgres",
    logging: false
  });

  await sequelize.authenticate();
  // eslint-disable-next-line no-console
  console.log(`✔ Conectado a ${DB_NAME}@${DB_HOST}:${DB_PORT}`);

  // ── 1. Tabla CommentResponseSettings ─────────────────────────────────────
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "CommentResponseSettings" (
      "id" SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL REFERENCES "Companies"("id") ON UPDATE CASCADE ON DELETE CASCADE,
      "whatsappId" INTEGER NOT NULL REFERENCES "Whatsapps"("id") ON UPDATE CASCADE ON DELETE CASCADE,
      "socialPostId" INTEGER NULL REFERENCES "UGCSocialPosts"("id") ON UPDATE CASCADE ON DELETE SET NULL,
      "mode" VARCHAR(20) NOT NULL DEFAULT 'manual',
      "autoMessage" TEXT NULL,
      "aiAgentConfigId" INTEGER NULL REFERENCES "AIAgentConfigs"("id") ON UPDATE CASCADE ON DELETE SET NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS "idx_comment_response_settings_company"
    ON "CommentResponseSettings" ("companyId");
  `);
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "uniq_comment_response_settings_connection"
    ON "CommentResponseSettings" ("companyId", "whatsappId")
    WHERE "socialPostId" IS NULL;
  `);
  await sequelize.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "uniq_comment_response_settings_post"
    ON "CommentResponseSettings" ("companyId", "whatsappId", "socialPostId")
    WHERE "socialPostId" IS NOT NULL;
  `);
  // eslint-disable-next-line no-console
  console.log("✔ Tabla CommentResponseSettings + índices OK");

  // ── 2. Columnas en Whatsapps ──────────────────────────────────────────────
  await sequelize.query(
    `ALTER TABLE "Whatsapps" ADD COLUMN IF NOT EXISTS "pageAccessToken" TEXT NULL;`
  );
  await sequelize.query(
    `ALTER TABLE "Whatsapps" ADD COLUMN IF NOT EXISTS "instagramBusinessAccountId" TEXT NULL;`
  );
  // eslint-disable-next-line no-console
  console.log("✔ Columnas Whatsapps (pageAccessToken, instagramBusinessAccountId) OK");

  // ── 3. Flags de moderación en UGCPostComments ────────────────────────────
  await sequelize.query(
    `ALTER TABLE "UGCPostComments" ADD COLUMN IF NOT EXISTS "isHidden" BOOLEAN NOT NULL DEFAULT false;`
  );
  await sequelize.query(
    `ALTER TABLE "UGCPostComments" ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false;`
  );
  // eslint-disable-next-line no-console
  console.log("✔ Columnas UGCPostComments (isHidden, isDeleted) OK");

  // ── 4. Registrar en SequelizeMeta (idempotente) ───────────────────────────
  for (const name of MIGRATIONS) {
    await sequelize.query(
      `INSERT INTO "SequelizeMeta" ("name") VALUES (:name) ON CONFLICT DO NOTHING;`,
      { replacements: { name } }
    );
  }
  // eslint-disable-next-line no-console
  console.log("✔ SequelizeMeta registrada");

  // ── 5. Verificación final ─────────────────────────────────────────────────
  const cols = await sequelize.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'CommentResponseSettings' ORDER BY ordinal_position;`,
    { type: QueryTypes.SELECT }
  );
  // eslint-disable-next-line no-console
  console.log(
    `✔ Verificación: CommentResponseSettings → [${cols.map(c => c.column_name).join(", ")}]`
  );

  await sequelize.close();
};

run().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error("✖ Error aplicando migraciones dirigidas:", err);
  process.exit(1);
});
