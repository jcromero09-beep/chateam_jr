import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("CampaignShipping", "attemptCount", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    await queryInterface.addColumn("CampaignShipping", "failedAt", {
      type: DataTypes.DATE,
      allowNull: true
    });

    await queryInterface.addColumn("CampaignShipping", "errorMessage", {
      type: DataTypes.TEXT,
      allowNull: true
    });

    await queryInterface.addColumn("CampaignShipping", "metaMessageId", {
      type: DataTypes.STRING(255),
      allowNull: true
    });

    await queryInterface.addIndex("CampaignShipping", ["campaignId", "deliveredAt"], {
      name: "idx_cpsh_campaign_delivered"
    });

    await queryInterface.addIndex("CampaignShipping", ["campaignId", "failedAt"], {
      name: "idx_cpsh_campaign_failed"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeIndex("CampaignShipping", "idx_cpsh_campaign_failed");
    await queryInterface.removeIndex("CampaignShipping", "idx_cpsh_campaign_delivered");
    await queryInterface.removeColumn("CampaignShipping", "metaMessageId");
    await queryInterface.removeColumn("CampaignShipping", "errorMessage");
    await queryInterface.removeColumn("CampaignShipping", "failedAt");
    await queryInterface.removeColumn("CampaignShipping", "attemptCount");
  }
};
