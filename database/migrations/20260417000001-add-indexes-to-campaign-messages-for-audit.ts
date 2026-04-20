import { QueryInterface } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addIndex("CampaignMessages", ["companyId", "sourceId"], {
      name: "idx_campaign_messages_company_source"
    });

    await queryInterface.addIndex("CampaignMessages", ["companyId", "ticketId"], {
      name: "idx_campaign_messages_company_ticket"
    });

    await queryInterface.addIndex("CampaignMessages", ["companyId", "createdAt"], {
      name: "idx_campaign_messages_company_created_at"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeIndex("CampaignMessages", "idx_campaign_messages_company_source");
    await queryInterface.removeIndex("CampaignMessages", "idx_campaign_messages_company_ticket");
    await queryInterface.removeIndex("CampaignMessages", "idx_campaign_messages_company_created_at");
  }
};
