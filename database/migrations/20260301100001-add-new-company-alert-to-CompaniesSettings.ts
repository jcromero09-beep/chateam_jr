import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("CompaniesSettings");

    if (!tableDesc["newCompanyAlertEnabled"]) {
      await queryInterface.addColumn("CompaniesSettings", "newCompanyAlertEnabled", {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "disabled",
        comment: "Activar alertas WhatsApp cuando se registra una nueva empresa Demo"
      });
      console.log("✅ Columna newCompanyAlertEnabled agregada a CompaniesSettings");
    } else {
      console.log("⚠️ Columna newCompanyAlertEnabled ya existe en CompaniesSettings, saltando...");
    }

    if (!tableDesc["newCompanyAlertPhone"]) {
      await queryInterface.addColumn("CompaniesSettings", "newCompanyAlertPhone", {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null,
        comment: "Número de teléfono destino para alertas de nuevas empresas (con código de país)"
      });
      console.log("✅ Columna newCompanyAlertPhone agregada a CompaniesSettings");
    } else {
      console.log("⚠️ Columna newCompanyAlertPhone ya existe en CompaniesSettings, saltando...");
    }

    if (!tableDesc["newCompanyAlertWhatsappId"]) {
      await queryInterface.addColumn("CompaniesSettings", "newCompanyAlertWhatsappId", {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: "ID de la conexión WhatsApp del superadmin usada para enviar alertas"
      });
      console.log("✅ Columna newCompanyAlertWhatsappId agregada a CompaniesSettings");
    } else {
      console.log("⚠️ Columna newCompanyAlertWhatsappId ya existe en CompaniesSettings, saltando...");
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("CompaniesSettings", "newCompanyAlertEnabled");
    await queryInterface.removeColumn("CompaniesSettings", "newCompanyAlertPhone");
    await queryInterface.removeColumn("CompaniesSettings", "newCompanyAlertWhatsappId");
  }
};
