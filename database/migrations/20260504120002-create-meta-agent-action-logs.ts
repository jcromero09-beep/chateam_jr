import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableExists = await queryInterface
      .showAllTables()
      .then((tables: string[]) => tables.includes("MetaAgentActionLogs"));

    if (!tableExists) {
      await queryInterface.createTable("MetaAgentActionLogs", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        planId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "MetaAgentPlans", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        action: {
          type: DataTypes.STRING(50),
          allowNull: false,
          comment: "pause_campaign | update_campaign_budget | duplicate_campaign | create_campaign_paused"
        },
        params: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: {}
        },
        success: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        errorMessage: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        metaResponse: {
          type: DataTypes.JSONB,
          allowNull: true,
          comment: "Respuesta cruda Graph API (incluye request_id para soporte)"
        },
        executedAt: {
          type: DataTypes.DATE,
          allowNull: false
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false
        }
      });

      await queryInterface.addIndex("MetaAgentActionLogs", ["planId"], {
        name: "idx_meta_agent_action_logs_plan"
      });
      await queryInterface.addIndex("MetaAgentActionLogs", ["companyId", "executedAt"], {
        name: "idx_meta_agent_action_logs_company_executed"
      });
      await queryInterface.addIndex("MetaAgentActionLogs", ["companyId", "action"], {
        name: "idx_meta_agent_action_logs_company_action"
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("MetaAgentActionLogs");
  }
};
