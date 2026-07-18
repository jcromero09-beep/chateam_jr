import { QueryInterface, DataTypes } from "sequelize";

/**
 * Migración PR #2: pipeline-builder en UGCCampaigns
 *
 * Agrega 5 columnas para soportar pipeline multi-slot:
 *   - voiceModelKey / voiceModelDefaults     (text-to-speech slot)
 *   - lipsyncModelKey / lipsyncModelDefaults (lipsync slot)
 *   - pipelineMode                           (enum string)
 *
 * El PR #1 ya creó videoModelKey, videoModelDefaults, imageModelKey,
 * imageModelDefaults, videoModelMotionReferenceUrl, modelSelectedAt,
 * modelSelectedBy. Este PR los conserva sin tocar.
 *
 * pipelineMode default = 'image-then-video' para que campañas legacy del
 * PR #1 mantengan su comportamiento sin migración de datos.
 *
 * Idempotente: verifica describeTable antes de agregar cada columna.
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

    // --- VOICE (text-to-speech) ---
    await addIfMissing("voiceModelKey", {
      type: DataTypes.STRING(80),
      allowNull: true,
      comment: "Adapter key TTS (p.ej. 'elevenlabs-tts-v3')"
    });
    await addIfMissing("voiceModelDefaults", {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: "Defaults validados por adapter.defaultSchema del TTS"
    });

    // --- LIPSYNC ---
    await addIfMissing("lipsyncModelKey", {
      type: DataTypes.STRING(80),
      allowNull: true,
      comment: "Adapter key lipsync (p.ej. 'sync-lipsync')"
    });
    await addIfMissing("lipsyncModelDefaults", {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: "Defaults validados por adapter.defaultSchema del lipsync"
    });

    // --- PIPELINE MODE ---
    // Default 'image-then-video' para retrocompat con campañas del PR #1.
    await addIfMissing("pipelineMode", {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: "image-then-video",
      comment:
        "image-then-video | text-to-video-direct | lipsync-talking-head"
    });

    // --- ÍNDICE ---
    try {
      await queryInterface.addIndex(tableName, {
        name: "idx_ugc_campaigns_pipeline_mode",
        fields: ["pipelineMode"]
      });
    } catch {
      // eslint-disable-next-line no-console
      console.log("⚠️  idx_ugc_campaigns_pipeline_mode ya existe, skip");
    }
  },

  /**
   * DOWN: SOLO para entornos no productivos.
   */
  down: async (queryInterface: QueryInterface): Promise<void> => {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "❌ down migration bloqueada en producción (regla BD SAGRADA)"
      );
    }

    const tableName = "UGCCampaigns";

    try {
      await queryInterface.removeIndex(
        tableName,
        "idx_ugc_campaigns_pipeline_mode"
      );
    } catch {
      /* no-op */
    }

    const dropIfExists = async (column: string): Promise<void> => {
      const table = await queryInterface.describeTable(tableName);
      if (!table[column]) return;
      await queryInterface.removeColumn(tableName, column);
    };

    for (const col of [
      "pipelineMode",
      "lipsyncModelDefaults",
      "lipsyncModelKey",
      "voiceModelDefaults",
      "voiceModelKey"
    ]) {
      await dropIfExists(col);
    }
  }
};
