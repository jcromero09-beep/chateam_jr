import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("AIAffiliatePrograms");

    if (!tableDesc["name"]) {
      await queryInterface.addColumn("AIAffiliatePrograms", "name", {
        type: DataTypes.STRING(255),
        allowNull: true,
        defaultValue: "Programa de Afiliados",
        comment: "Nombre del programa de afiliados"
      });
      console.log("✅ Columna name agregada a AIAffiliatePrograms");
    } else {
      console.log("⚠️ Columna name ya existe en AIAffiliatePrograms, saltando...");
    }

    if (!tableDesc["description"]) {
      await queryInterface.addColumn("AIAffiliatePrograms", "description", {
        type: DataTypes.TEXT,
        allowNull: true,
        defaultValue: null,
        comment: "Descripcion del programa de afiliados"
      });
      console.log("✅ Columna description agregada a AIAffiliatePrograms");
    } else {
      console.log("⚠️ Columna description ya existe en AIAffiliatePrograms, saltando...");
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("AIAffiliatePrograms", "name");
    await queryInterface.removeColumn("AIAffiliatePrograms", "description");
  }
};
