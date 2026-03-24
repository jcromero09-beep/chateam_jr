import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("Companies");

    if (!tableDesc["referredByCode"]) {
      await queryInterface.addColumn("Companies", "referredByCode", {
        type: DataTypes.STRING(50),
        allowNull: true,
        defaultValue: null,
        comment: "Codigo de referido del programa de afiliados que refirio a esta empresa"
      });

      await queryInterface.addIndex("Companies", ["referredByCode"], {
        name: "idx_companies_referred_by_code"
      });

      console.log("✅ Columna referredByCode agregada a Companies");
    } else {
      console.log("⚠️ Columna referredByCode ya existe en Companies, saltando...");
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Companies", "referredByCode");
  }
};
