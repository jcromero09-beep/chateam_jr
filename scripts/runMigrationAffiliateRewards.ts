/**
 * Aplica la migración 20260429000001-affiliate-rewards-tokens-days y la marca
 * como aplicada en SequelizeMeta. Idempotente.
 */
import "dotenv/config";
import path from "path";
import { Sequelize, QueryInterface } from "sequelize";

const main = async () => {
  const sequelize = new Sequelize(
    process.env.DB_NAME || "chateamjr",
    process.env.DB_USER || "atendimento",
    process.env.DB_PASS || "",
    {
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 5432),
      dialect: "postgres",
      logging: false
    }
  );

  await sequelize.authenticate();
  console.log("✅ Conectado a PostgreSQL");

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS "SequelizeMeta" (
      "name" VARCHAR(255) NOT NULL PRIMARY KEY
    );
  `);

  const migrationName = "20260429000001-affiliate-rewards-tokens-days";
  const [appliedRows]: any = await sequelize.query(
    `SELECT "name" FROM "SequelizeMeta" WHERE "name" = $1 OR "name" = $2`,
    {
      bind: [`${migrationName}.js`, `${migrationName}.ts`]
    }
  );

  if (appliedRows && appliedRows.length > 0) {
    console.log(`ℹ️  Ya aplicada: ${migrationName}`);
    await sequelize.close();
    return;
  }

  const migrationPath = path.resolve(
    __dirname,
    "..",
    "database",
    "migrations",
    `${migrationName}.ts`
  );
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const migration = require(migrationPath);

  const qi: QueryInterface = sequelize.getQueryInterface();
  console.log(`▶️  Aplicando ${migrationName}...`);
  await migration.up(qi);

  await sequelize.query(
    `INSERT INTO "SequelizeMeta" ("name") VALUES ($1)
     ON CONFLICT ("name") DO NOTHING;`,
    { bind: [`${migrationName}.js`] }
  );

  console.log("✅ Migración aplicada y registrada en SequelizeMeta");
  await sequelize.close();
};

main().catch((err) => {
  console.error("❌ Error aplicando migración:", err.message);
  console.error(err);
  process.exit(1);
});
