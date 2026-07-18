import { QueryInterface, DataTypes } from "sequelize";

/**
 * Migración: model-selection en UGCCampaigns
 *
 * Agrega 9 columnas a UGCCampaigns para soportar selección persistente
 * de modelo fal.ai (video + image edit) por campaña:
 *   - 4 columnas de configuración de modelo de video
 *   - 1 columna para asset de motion-reference (solo motion-control)
 *   - 3 columnas de configuración de modelo de imagen
 *   - 2 columnas de auditoría (modelSelectedAt / modelSelectedBy)
 *
 * Idempotente: verifica describeTable antes de agregar cada columna.
 * Down disponible solo para entornos no productivos (regla BD SAGRADA).
 */
module.exports = {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const tableName = "UGCCampaigns";
    const table = await queryInterface.describeTable(tableName);

    const addIfMissing = async (
      column: string,
      definition: Parameters<QueryInterface["addColumn"]>[2]
    ): Promise<void> => {
      if (table[column]) {
        // eslint-disable-next-line no-console
        console.log(`⚠️  ${tableName}.${column} ya existe, skip`);
        return;
      }
      await queryInterface.addColumn(tableName, column, definition);
    };

    // --- VIDEO ---
    await addIfMissing("videoModelKey", {
      type: DataTypes.STRING(80),
      allowNull: true,
      comment:
        "Clave interna del adapter de fal.ai (p.ej. 'kling-v2.6-pro-i2v')"
    });

    await addIfMissing("videoModelId", {
      type: DataTypes.STRING(160),
      allowNull: true,
      comment: "Model ID literal de fal.ai (denormalizado para auditoría)"
    });

    await addIfMissing("videoModelDefaults", {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment:
        "Defaults validados por adapter.defaultSchema (duration, aspect_ratio, etc.)"
    });

    await addIfMissing("videoModelMotionReferenceUrl", {
      type: DataTypes.TEXT,
      allowNull: true,
      comment:
        "URL del video de motion-reference (solo motion-control adapters)"
    });

    // --- IMAGE ---
    await addIfMissing("imageModelKey", {
      type: DataTypes.STRING(80),
      allowNull: true,
      comment:
        "Clave interna del adapter de imagen (p.ej. 'nano-banana-2-edit')"
    });

    await addIfMissing("imageModelId", {
      type: DataTypes.STRING(160),
      allowNull: true,
      comment: "Model ID literal de fal.ai para imagen"
    });

    await addIfMissing("imageModelDefaults", {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: "Defaults validados por adapter.defaultSchema de imagen"
    });

    // --- AUDITORÍA ---
    await addIfMissing("modelSelectedAt", {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Timestamp de última actualización de model-selection"
    });

    await addIfMissing("modelSelectedBy", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
      comment: "FK al User que confirmó la selección"
    });

    // --- ÍNDICES ---
    // Detectan campañas que YA tienen modelo configurado para reportes y
    // dashboards de "campañas huérfanas sin modelo".
    try {
      await queryInterface.addIndex(tableName, {
        name: "idx_ugc_campaigns_video_model_key",
        fields: ["videoModelKey"]
      });
    } catch {
      // eslint-disable-next-line no-console
      console.log("⚠️  idx_ugc_campaigns_video_model_key ya existe, skip");
    }

    try {
      await queryInterface.addIndex(tableName, {
        name: "idx_ugc_campaigns_image_model_key",
        fields: ["imageModelKey"]
      });
    } catch {
      // eslint-disable-next-line no-console
      console.log("⚠️  idx_ugc_campaigns_image_model_key ya existe, skip");
    }
  },

  /**
   * DOWN: SOLO para entornos no productivos.
   * En producción NO se ejecuta — la regla inamovible prohíbe DROP COLUMN.
   */
  down: async (queryInterface: QueryInterface): Promise<void> => {
    const tableName = "UGCCampaigns";

    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "❌ down migration bloqueada en producción (regla BD SAGRADA: no DROP COLUMN)"
      );
    }

    const dropIfExists = async (column: string): Promise<void> => {
      const table = await queryInterface.describeTable(tableName);
      if (!table[column]) return;
      await queryInterface.removeColumn(tableName, column);
    };

    // Remover índices primero
    for (const idx of [
      "idx_ugc_campaigns_video_model_key",
      "idx_ugc_campaigns_image_model_key"
    ]) {
      try {
        await queryInterface.removeIndex(tableName, idx);
      } catch {
        /* no-op */
      }
    }

    // Luego columnas (orden inverso al up)
    for (const col of [
      "modelSelectedBy",
      "modelSelectedAt",
      "imageModelDefaults",
      "imageModelId",
      "imageModelKey",
      "videoModelMotionReferenceUrl",
      "videoModelDefaults",
      "videoModelId",
      "videoModelKey"
    ]) {
      await dropIfExists(col);
    }
  }
};
