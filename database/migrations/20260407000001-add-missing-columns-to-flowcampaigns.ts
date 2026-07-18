import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table = await queryInterface.describeTable("FlowCampaigns");

    if (!table.companyId) {
      await queryInterface.addColumn("FlowCampaigns", "companyId", {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
    }
    if (!table.userId) {
      await queryInterface.addColumn("FlowCampaigns", "userId", {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
    }
    if (!table.phrase) {
      await queryInterface.addColumn("FlowCampaigns", "phrase", {
        type: DataTypes.STRING(255),
        allowNull: true,
      });
    }
    if (!table.whatsappId) {
      await queryInterface.addColumn("FlowCampaigns", "whatsappId", {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Whatsapps", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("FlowCampaigns", "companyId");
    await queryInterface.removeColumn("FlowCampaigns", "userId");
    await queryInterface.removeColumn("FlowCampaigns", "phrase");
    await queryInterface.removeColumn("FlowCampaigns", "whatsappId");
  },
};
