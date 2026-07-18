import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("CompaniesSettings");

    if (!tableDesc["expirationAlertEnabled"]) {
      await queryInterface.addColumn("CompaniesSettings", "expirationAlertEnabled", {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "disabled",
        comment: "Activar alertas WhatsApp cuando una empresa esta por expirar o ya expiro"
      });
      console.log("✅ Columna expirationAlertEnabled agregada a CompaniesSettings");
    } else {
      console.log("⚠️ Columna expirationAlertEnabled ya existe, saltando...");
    }

    if (!tableDesc["expirationAlertPhone"]) {
      await queryInterface.addColumn("CompaniesSettings", "expirationAlertPhone", {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
        comment: "Telefonos destino (CSV) para alertas de expiracion de empresas"
      });
      console.log("✅ Columna expirationAlertPhone agregada a CompaniesSettings");
    } else {
      console.log("⚠️ Columna expirationAlertPhone ya existe, saltando...");
    }

    if (!tableDesc["expirationAlertWhatsappId"]) {
      await queryInterface.addColumn("CompaniesSettings", "expirationAlertWhatsappId", {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: "ID de la conexion WhatsApp del superadmin usada para enviar alertas de expiracion"
      });
      console.log("✅ Columna expirationAlertWhatsappId agregada a CompaniesSettings");
    } else {
      console.log("⚠️ Columna expirationAlertWhatsappId ya existe, saltando...");
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("CompaniesSettings", "expirationAlertEnabled");
    await queryInterface.removeColumn("CompaniesSettings", "expirationAlertPhone");
    await queryInterface.removeColumn("CompaniesSettings", "expirationAlertWhatsappId");
  }
};
