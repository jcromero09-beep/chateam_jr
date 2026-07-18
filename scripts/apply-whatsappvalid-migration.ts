/**
 * Runner PUNTUAL e idempotente para la migración 20260707000001
 * (add whatsappValid + whatsappValidatedAt a Contacts).
 *
 * El runner oficial (db:migrate) lee de dist/ compilado; esta migración vive en
 * source (.ts) porque el backend corre con tsx. Este script aplica SOLO esta
 * migración desde source, con describeTable (idempotente) y la registra en
 * SequelizeMeta para que el runner oficial la vea como aplicada.
 *
 * Uso: npx tsx scripts/apply-whatsappvalid-migration.ts
 */
import "dotenv/config";
import { Sequelize, DataTypes } from "sequelize";

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

const main = async (): Promise<void> => {
  await sequelize.authenticate();
  console.log(`✅ Conectado a PostgreSQL (${process.env.DB_NAME || "chateamjr"})`);

  const qi = sequelize.getQueryInterface();
  const desc: any = await qi.describeTable("Contacts");

  if (!desc.whatsappValid) {
    await qi.addColumn("Contacts", "whatsappValid", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    });
    console.log("✅ addColumn: whatsappValid");
  } else {
    console.log("ℹ️  whatsappValid ya existía (no se toca)");
  }

  if (!desc.whatsappValidatedAt) {
    await qi.addColumn("Contacts", "whatsappValidatedAt", {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: null
    });
    console.log("✅ addColumn: whatsappValidatedAt");
  } else {
    console.log("ℹ️  whatsappValidatedAt ya existía (no se toca)");
  }

  // Registrar en SequelizeMeta (convención .js del runner oficial)
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS "SequelizeMeta" ("name" VARCHAR(255) NOT NULL PRIMARY KEY);`
  );
  await sequelize.query(
    `INSERT INTO "SequelizeMeta" ("name") VALUES (:name) ON CONFLICT DO NOTHING`,
    { replacements: { name: "20260707000001-add-whatsapp-valid-to-contacts.js" } }
  );
  console.log("✅ Registrada en SequelizeMeta");

  const desc2: any = await qi.describeTable("Contacts");
  console.log("🔎 Verificación final:", {
    whatsappValid: !!desc2.whatsappValid,
    whatsappValidatedAt: !!desc2.whatsappValidatedAt
  });

  await sequelize.close();
  console.log("🎉 Migración aplicada correctamente.");
};

main().catch((err) => {
  console.error("❌ Error aplicando migración:", err?.message || err);
  process.exit(1);
});
