import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // ========== Tabla Whatsapps: campos de coexistencia ==========
    const whatsappColumns = await queryInterface.describeTable("Whatsapps");

    if (!whatsappColumns["coexistenceEnabled"]) {
      await queryInterface.addColumn("Whatsapps", "coexistenceEnabled", {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      });
    }

    if (!whatsappColumns["coexistenceStatus"]) {
      await queryInterface.addColumn("Whatsapps", "coexistenceStatus", {
        type: DataTypes.STRING(50),
        defaultValue: null,
        allowNull: true,
        comment: "pending_sync | syncing | active | disabled",
      });
    }

    if (!whatsappColumns["coexistenceOnboardedAt"]) {
      await queryInterface.addColumn("Whatsapps", "coexistenceOnboardedAt", {
        type: DataTypes.DATE,
        defaultValue: null,
        allowNull: true,
      });
    }

    if (!whatsappColumns["lastAppOpenedAt"]) {
      await queryInterface.addColumn("Whatsapps", "lastAppOpenedAt", {
        type: DataTypes.DATE,
        defaultValue: null,
        allowNull: true,
        comment: "Ultima vez que se abrio la Business App (liveness 13 dias)",
      });
    }

    if (!whatsappColumns["embeddedSignupSessionId"]) {
      await queryInterface.addColumn("Whatsapps", "embeddedSignupSessionId", {
        type: DataTypes.STRING(255),
        defaultValue: null,
        allowNull: true,
      });
    }

    // ========== Tabla Messages: campo sourceChannel ==========
    const messageColumns = await queryInterface.describeTable("Messages");

    if (!messageColumns["sourceChannel"]) {
      await queryInterface.addColumn("Messages", "sourceChannel", {
        type: DataTypes.STRING(50),
        defaultValue: null,
        allowNull: true,
        comment: "cloud_api | business_app | baileys | history_import",
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Whatsapps", "coexistenceEnabled");
    await queryInterface.removeColumn("Whatsapps", "coexistenceStatus");
    await queryInterface.removeColumn("Whatsapps", "coexistenceOnboardedAt");
    await queryInterface.removeColumn("Whatsapps", "lastAppOpenedAt");
    await queryInterface.removeColumn("Whatsapps", "embeddedSignupSessionId");
    await queryInterface.removeColumn("Messages", "sourceChannel");
  },
};
