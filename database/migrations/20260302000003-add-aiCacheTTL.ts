import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const columns = await queryInterface.describeTable("CompaniesSettings");

    if (!columns["aiCacheTTL"]) {
      await queryInterface.addColumn("CompaniesSettings", "aiCacheTTL", {
        type: DataTypes.INTEGER,
        defaultValue: 300,
        allowNull: false,
        comment: "TTL en segundos para cache de prompts IA por company (default: 300 = 5min)",
      });
      console.log("Columna aiCacheTTL agregada a CompaniesSettings (default: 300)");
    } else {
      console.log("Columna aiCacheTTL ya existe en CompaniesSettings, skip");
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("CompaniesSettings", "aiCacheTTL");
  },
};
