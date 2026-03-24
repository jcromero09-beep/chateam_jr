import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // ============================================================
    // MIGRACIÓN: Agregar campos TikTok OAuth a Whatsapps y Contacts
    // Canal: TikTok Comments (solo lectura via Research API)
    // Fecha: 2026-03-02
    // ============================================================

    // --- TABLA WHATSAPPS ---
    const whatsappInfo = await queryInterface.describeTable("Whatsapps");

    if (!whatsappInfo["tiktokAccessToken"]) {
      await queryInterface.addColumn("Whatsapps", "tiktokAccessToken", {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "TikTok OAuth2 access token (24h TTL)",
      });
      console.log("✅ Columna tiktokAccessToken agregada a Whatsapps");
    } else {
      console.log("⏭️ tiktokAccessToken ya existe en Whatsapps, skip");
    }

    if (!whatsappInfo["tiktokRefreshToken"]) {
      await queryInterface.addColumn("Whatsapps", "tiktokRefreshToken", {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "TikTok OAuth2 refresh token (365 días TTL)",
      });
      console.log("✅ Columna tiktokRefreshToken agregada a Whatsapps");
    } else {
      console.log("⏭️ tiktokRefreshToken ya existe en Whatsapps, skip");
    }

    if (!whatsappInfo["tiktokOpenId"]) {
      await queryInterface.addColumn("Whatsapps", "tiktokOpenId", {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "TikTok user open_id (identificador único del usuario)",
      });
      console.log("✅ Columna tiktokOpenId agregada a Whatsapps");
    } else {
      console.log("⏭️ tiktokOpenId ya existe en Whatsapps, skip");
    }

    if (!whatsappInfo["tiktokTokenExpiresAt"]) {
      await queryInterface.addColumn("Whatsapps", "tiktokTokenExpiresAt", {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Fecha de expiración del access token TikTok",
      });
      console.log("✅ Columna tiktokTokenExpiresAt agregada a Whatsapps");
    } else {
      console.log("⏭️ tiktokTokenExpiresAt ya existe en Whatsapps, skip");
    }

    if (!whatsappInfo["tiktokLastPollAt"]) {
      await queryInterface.addColumn("Whatsapps", "tiktokLastPollAt", {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Timestamp del último poll exitoso de comentarios",
      });
      console.log("✅ Columna tiktokLastPollAt agregada a Whatsapps");
    } else {
      console.log("⏭️ tiktokLastPollAt ya existe en Whatsapps, skip");
    }

    if (!whatsappInfo["tiktokPollingEnabled"]) {
      await queryInterface.addColumn("Whatsapps", "tiktokPollingEnabled", {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: true,
        comment: "Toggle para activar/desactivar polling de comentarios TikTok",
      });
      console.log("✅ Columna tiktokPollingEnabled agregada a Whatsapps");
    } else {
      console.log("⏭️ tiktokPollingEnabled ya existe en Whatsapps, skip");
    }

    // --- TABLA CONTACTS ---
    const contactInfo = await queryInterface.describeTable("Contacts");

    if (!contactInfo["tiktokUserId"]) {
      await queryInterface.addColumn("Contacts", "tiktokUserId", {
        type: DataTypes.STRING,
        allowNull: true,
        comment: "ID del usuario TikTok que comentó",
      });
      console.log("✅ Columna tiktokUserId agregada a Contacts");
    } else {
      console.log("⏭️ tiktokUserId ya existe en Contacts, skip");
    }

    console.log("✅ Migración TikTok Channel Fields completada");
  },

  down: async (_queryInterface: QueryInterface) => {
    // BD SAGRADA: NUNCA eliminar columnas
    console.log("⚠️ Down vacío — BD SAGRADA: no se eliminan columnas");
  },
};
