import { QueryInterface, DataTypes } from "sequelize";

/**
 * Migración: soporte de generación STANDALONE (playground) multi-proveedor en
 * UGCVideoJobs, para la integración de Higgsfield (y futuros proveedores).
 *
 * Cambios (todos NO destructivos — regla BD SAGRADA):
 *   1. ugcCampaignId → DROP NOT NULL (jobs ad-hoc sin campaña).
 *   2. ADD COLUMN: provider, mediaType, modelKey, styleId, idempotencyKey,
 *      promptText.
 *   3. Índices: UNIQUE (companyId, idempotencyKey) e (companyId, provider).
 *
 * Idempotente: verifica describeTable antes de cada cambio.
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const tableName = "UGCVideoJobs";
    const table = await queryInterface.describeTable(tableName);

    // --- 1) ugcCampaignId nullable (jobs standalone sin campaña) ---
    if (table.ugcCampaignId && table.ugcCampaignId.allowNull === false) {
      await queryInterface.changeColumn(tableName, "ugcCampaignId", {
        type: DataTypes.INTEGER,
        allowNull: true
      });
      // eslint-disable-next-line no-console
      console.log(`✅ ${tableName}.ugcCampaignId ahora es nullable`);
    }

    const addIfMissing = async (
      column: string,
      definition: Parameters<QueryInterface["addColumn"]>[2]
    ): Promise<void> => {
      const current = await queryInterface.describeTable(tableName);
      if (current[column]) {
        // eslint-disable-next-line no-console
        console.log(`⚠️  ${tableName}.${column} ya existe, skip`);
        return;
      }
      await queryInterface.addColumn(tableName, column, definition);
    };

    // --- 2) Columnas de generación standalone ---
    await addIfMissing("provider", {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "Proveedor de generación: higgsfield | fal (null = legacy)"
    });
    await addIfMissing("mediaType", {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: "image | video"
    });
    await addIfMissing("modelKey", {
      type: DataTypes.STRING(120),
      allowNull: true,
      comment: "Id de modelo normalizado usado"
    });
    await addIfMissing("styleId", {
      type: DataTypes.STRING(120),
      allowNull: true,
      comment: "Preset/estilo cinema seleccionado"
    });
    await addIfMissing("idempotencyKey", {
      type: DataTypes.STRING(120),
      allowNull: true,
      comment: "Clave de idempotencia por (companyId, idempotencyKey)"
    });
    await addIfMissing("promptText", {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Prompt del playground (distinto de script de campaña)"
    });

    // --- 3) Índices ---
    try {
      await queryInterface.addIndex(tableName, {
        name: "idx_ugc_video_jobs_idem",
        unique: true,
        fields: ["companyId", "idempotencyKey"]
      });
    } catch {
      // eslint-disable-next-line no-console
      console.log("⚠️  idx_ugc_video_jobs_idem ya existe, skip");
    }

    try {
      await queryInterface.addIndex(tableName, {
        name: "idx_ugc_video_jobs_provider",
        fields: ["companyId", "provider"]
      });
    } catch {
      // eslint-disable-next-line no-console
      console.log("⚠️  idx_ugc_video_jobs_provider ya existe, skip");
    }
  },

  /**
   * DOWN: SOLO entornos no productivos. NO revierte el NOT NULL de
   * ugcCampaignId (podría haber jobs standalone con campaña null que romperían
   * la restricción) — se deja nullable de forma permanente.
   */
  down: async (queryInterface: QueryInterface): Promise<void> => {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "❌ down migration bloqueada en producción (regla BD SAGRADA)"
      );
    }

    const tableName = "UGCVideoJobs";

    for (const idx of [
      "idx_ugc_video_jobs_idem",
      "idx_ugc_video_jobs_provider"
    ]) {
      try {
        await queryInterface.removeIndex(tableName, idx);
      } catch {
        /* no-op */
      }
    }

    const dropIfExists = async (column: string): Promise<void> => {
      const table = await queryInterface.describeTable(tableName);
      if (!table[column]) return;
      await queryInterface.removeColumn(tableName, column);
    };

    for (const col of [
      "promptText",
      "idempotencyKey",
      "styleId",
      "modelKey",
      "mediaType",
      "provider"
    ]) {
      await dropIfExists(col);
    }
  }
};
