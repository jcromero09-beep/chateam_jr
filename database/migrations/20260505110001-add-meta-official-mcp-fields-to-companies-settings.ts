import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("CompaniesSettings");

    if (!tableDesc["metaMcpStatus"]) {
      await queryInterface.addColumn("CompaniesSettings", "metaMcpStatus", {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "not_connected",
        comment: "Estado de conexion al Meta Ads MCP oficial: not_connected | pending | connected | error"
      });
    }

    if (!tableDesc["metaMcpServerUrl"]) {
      await queryInterface.addColumn("CompaniesSettings", "metaMcpServerUrl", {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: "https://mcp.facebook.com/ads",
        comment: "URL del servidor MCP oficial de Meta Ads"
      });
    }

    if (!tableDesc["metaMcpConnectedAt"]) {
      await queryInterface.addColumn("CompaniesSettings", "metaMcpConnectedAt", {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        comment: "Fecha en que el usuario marco o completo la conexion MCP oficial"
      });
    }

    if (!tableDesc["metaMcpLastCheckedAt"]) {
      await queryInterface.addColumn("CompaniesSettings", "metaMcpLastCheckedAt", {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        comment: "Ultima verificacion de estado MCP oficial"
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("CompaniesSettings", "metaMcpStatus");
    await queryInterface.removeColumn("CompaniesSettings", "metaMcpServerUrl");
    await queryInterface.removeColumn("CompaniesSettings", "metaMcpConnectedAt");
    await queryInterface.removeColumn("CompaniesSettings", "metaMcpLastCheckedAt");
  }
};
