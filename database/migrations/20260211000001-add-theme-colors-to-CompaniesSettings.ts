import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("CompaniesSettings", "themePrimaryLight", {
      type: DataTypes.STRING,
      defaultValue: "#5BC2D2",
      allowNull: true,
    });
    await queryInterface.addColumn("CompaniesSettings", "themePrimaryDark", {
      type: DataTypes.STRING,
      defaultValue: "#6FD4E4",
      allowNull: true,
    });
    await queryInterface.addColumn("CompaniesSettings", "themeSecondaryLight", {
      type: DataTypes.STRING,
      defaultValue: "#4caf50",
      allowNull: true,
    });
    await queryInterface.addColumn("CompaniesSettings", "themeSecondaryDark", {
      type: DataTypes.STRING,
      defaultValue: "#4caf50",
      allowNull: true,
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("CompaniesSettings", "themePrimaryLight");
    await queryInterface.removeColumn("CompaniesSettings", "themePrimaryDark");
    await queryInterface.removeColumn("CompaniesSettings", "themeSecondaryLight");
    await queryInterface.removeColumn("CompaniesSettings", "themeSecondaryDark");
  }
};
