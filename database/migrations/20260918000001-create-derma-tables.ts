import { QueryInterface, DataTypes } from "sequelize";

/**
 * [Derma] Módulo de análisis facial profesional (esteticistas / cosmetólogas /
 * cosmiatras): tablas `DermaPatients` y `DermaAnalyses` + tipo de crédito
 * `derma_analysis` en `AICreditTypes`.
 *
 * Idempotente: si la tabla ya existe no hace nada; el seed usa ON CONFLICT.
 *
 * ## Cómo aplicarla a mano (el runner `db:migrate` puede estar desincronizado,
 * ver 20260728000001): equivalente SQL de `up`:
 *
 *     BEGIN;
 *     CREATE TABLE IF NOT EXISTS "DermaPatients" (
 *       id SERIAL PRIMARY KEY,
 *       "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON DELETE CASCADE,
 *       "userId" INTEGER REFERENCES "Users"(id) ON DELETE SET NULL,
 *       "contactId" INTEGER REFERENCES "Contacts"(id) ON DELETE SET NULL,
 *       name VARCHAR(150) NOT NULL,
 *       email VARCHAR(150), phone VARCHAR(50), "birthDate" DATE, gender VARCHAR(20),
 *       notes TEXT, "lastScore" INTEGER, "lastAnalysisAt" TIMESTAMPTZ,
 *       "isActive" BOOLEAN NOT NULL DEFAULT true,
 *       "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL
 *     );
 *     CREATE INDEX IF NOT EXISTS idx_derma_patients_company ON "DermaPatients"("companyId");
 *     CREATE TABLE IF NOT EXISTS "DermaAnalyses" (
 *       id SERIAL PRIMARY KEY,
 *       "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON DELETE CASCADE,
 *       "patientId" INTEGER NOT NULL REFERENCES "DermaPatients"(id) ON DELETE CASCADE,
 *       "userId" INTEGER REFERENCES "Users"(id) ON DELETE SET NULL,
 *       status VARCHAR(20) NOT NULL DEFAULT 'pending',
 *       "imagePath" VARCHAR(500), "imageMimeType" VARCHAR(100),
 *       "selectedMetrics" JSONB NOT NULL DEFAULT '[]'::jsonb,
 *       "clinicalDetail" BOOLEAN NOT NULL DEFAULT false,
 *       "globalScore" INTEGER, "skinType" VARCHAR(80), "skinAge" INTEGER, summary TEXT,
 *       result JSONB, "creditsUsed" INTEGER NOT NULL DEFAULT 0,
 *       provider VARCHAR(50), model VARCHAR(100), "tokensUsed" INTEGER, "latencyMs" INTEGER,
 *       "errorMessage" TEXT,
 *       "createdAt" TIMESTAMPTZ NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL
 *     );
 *     CREATE INDEX IF NOT EXISTS idx_derma_analyses_company ON "DermaAnalyses"("companyId");
 *     CREATE INDEX IF NOT EXISTS idx_derma_analyses_patient ON "DermaAnalyses"("patientId");
 *     INSERT INTO "AICreditTypes" (key, name, description, unit, "defaultCost", "isActive", "createdAt", "updatedAt")
 *     VALUES ('derma_analysis', 'Analisis Facial Derma', 'Credito por analisis facial (1) o con detalle clinico (15)', 'credits', 0.100000, true, NOW(), NOW())
 *     ON CONFLICT (key) DO NOTHING;
 *     COMMIT;
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const patientsExist = await queryInterface
      .tableExists?.("DermaPatients")
      .catch(() => false);
    if (!patientsExist) {
      await queryInterface.createTable("DermaPatients", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false,
        },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        userId: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "Users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        contactId: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "Contacts", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        name: { type: DataTypes.STRING(150), allowNull: false },
        email: { type: DataTypes.STRING(150), allowNull: true },
        phone: { type: DataTypes.STRING(50), allowNull: true },
        birthDate: { type: DataTypes.DATEONLY, allowNull: true },
        gender: { type: DataTypes.STRING(20), allowNull: true },
        notes: { type: DataTypes.TEXT, allowNull: true },
        lastScore: { type: DataTypes.INTEGER, allowNull: true },
        lastAnalysisAt: { type: DataTypes.DATE, allowNull: true },
        isActive: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface
        .addIndex("DermaPatients", ["companyId"], {
          name: "idx_derma_patients_company",
        })
        .catch(() => undefined);
    }

    const analysesExist = await queryInterface
      .tableExists?.("DermaAnalyses")
      .catch(() => false);
    if (!analysesExist) {
      await queryInterface.createTable("DermaAnalyses", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false,
        },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        patientId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "DermaPatients", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        userId: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "Users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        status: {
          type: DataTypes.STRING(20),
          allowNull: false,
          defaultValue: "pending",
        },
        imagePath: { type: DataTypes.STRING(500), allowNull: true },
        imageMimeType: { type: DataTypes.STRING(100), allowNull: true },
        selectedMetrics: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: [],
        },
        clinicalDetail: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        globalScore: { type: DataTypes.INTEGER, allowNull: true },
        skinType: { type: DataTypes.STRING(80), allowNull: true },
        skinAge: { type: DataTypes.INTEGER, allowNull: true },
        summary: { type: DataTypes.TEXT, allowNull: true },
        result: { type: DataTypes.JSONB, allowNull: true },
        creditsUsed: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        provider: { type: DataTypes.STRING(50), allowNull: true },
        model: { type: DataTypes.STRING(100), allowNull: true },
        tokensUsed: { type: DataTypes.INTEGER, allowNull: true },
        latencyMs: { type: DataTypes.INTEGER, allowNull: true },
        errorMessage: { type: DataTypes.TEXT, allowNull: true },
        createdAt: { type: DataTypes.DATE, allowNull: false },
        updatedAt: { type: DataTypes.DATE, allowNull: false },
      });
      await queryInterface
        .addIndex("DermaAnalyses", ["companyId"], {
          name: "idx_derma_analyses_company",
        })
        .catch(() => undefined);
      await queryInterface
        .addIndex("DermaAnalyses", ["patientId"], {
          name: "idx_derma_analyses_patient",
        })
        .catch(() => undefined);
    }

    // Tipo de crédito consumido por el módulo (DeductCreditsService lo busca por key).
    await queryInterface.sequelize.query(`
      INSERT INTO "AICreditTypes" (key, name, description, unit, "defaultCost", "isActive", "createdAt", "updatedAt")
      VALUES ('derma_analysis', 'Analisis Facial Derma',
              'Credito por analisis facial (1) o con detalle clinico (15)',
              'credits', 0.100000, true, NOW(), NOW())
      ON CONFLICT (key) DO NOTHING
    `);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("DermaAnalyses").catch(() => undefined);
    await queryInterface.dropTable("DermaPatients").catch(() => undefined);
    // El tipo de crédito se conserva: puede tener transacciones históricas asociadas.
  },
};
