import { QueryInterface, DataTypes } from "sequelize";

/**
 * Agrega el estado de verificación de WhatsApp a los contactos.
 *  - whatsappValid: null = sin verificar | 'pending' = en cola de verificación
 *                   | 'valid' = tiene WhatsApp activo | 'invalid' = sin WhatsApp
 *  - whatsappValidatedAt: fecha de la última verificación
 *
 * ADD COLUMN no destructivo (idempotente). Los contactos existentes quedan en null.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("Contacts");

    if (!tableDesc["whatsappValid"]) {
      await queryInterface.addColumn("Contacts", "whatsappValid", {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null
      });
    }

    if (!tableDesc["whatsappValidatedAt"]) {
      await queryInterface.addColumn("Contacts", "whatsappValidatedAt", {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("Contacts");

    if (tableDesc["whatsappValidatedAt"]) {
      await queryInterface.removeColumn("Contacts", "whatsappValidatedAt");
    }
    if (tableDesc["whatsappValid"]) {
      await queryInterface.removeColumn("Contacts", "whatsappValid");
    }
  }
};
