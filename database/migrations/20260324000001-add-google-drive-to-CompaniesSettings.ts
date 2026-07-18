import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.addColumn("CompaniesSettings", "googleDriveEnabled", {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      }),
      queryInterface.addColumn("CompaniesSettings", "googleDriveTokens", {
        type: DataTypes.JSONB,
        allowNull: true,
      }),
      queryInterface.addColumn("CompaniesSettings", "lastDriveBackupAt", {
        type: DataTypes.DATE,
        allowNull: true,
      }),
      queryInterface.addColumn("CompaniesSettings", "googleDriveFolderId", {
        type: DataTypes.STRING,
        allowNull: true,
      }),
    ]);
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeColumn("CompaniesSettings", "googleDriveEnabled"),
      queryInterface.removeColumn("CompaniesSettings", "googleDriveTokens"),
      queryInterface.removeColumn("CompaniesSettings", "lastDriveBackupAt"),
      queryInterface.removeColumn("CompaniesSettings", "googleDriveFolderId"),
    ]);
  }
};
