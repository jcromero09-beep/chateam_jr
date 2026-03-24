import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const columns = await queryInterface.describeTable("CompaniesSettings");

    if (!columns["cloudAPIEnabled"]) {
      await queryInterface.addColumn("CompaniesSettings", "cloudAPIEnabled", {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
        comment: "Habilita WhatsApp Cloud API / Coexistencia Meta para esta company",
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("CompaniesSettings", "cloudAPIEnabled");
  },
};
