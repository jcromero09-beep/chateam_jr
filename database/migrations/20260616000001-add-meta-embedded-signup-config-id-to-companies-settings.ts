import { DataTypes, QueryInterface } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    const table = await queryInterface.describeTable("CompaniesSettings");

    if (!table["metaEmbeddedSignupConfigId"]) {
      await queryInterface.addColumn("CompaniesSettings", "metaEmbeddedSignupConfigId", {
        type: DataTypes.STRING,
        allowNull: true
      });
    }
  },

  down: async (): Promise<void> => {
    // Aditiva: no eliminar la configuracion por empresa automaticamente.
  }
};
