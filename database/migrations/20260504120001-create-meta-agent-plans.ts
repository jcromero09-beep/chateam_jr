import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableExists = await queryInterface
      .showAllTables()
      .then((tables: string[]) => tables.includes("MetaAgentPlans"));

    if (!tableExists) {
      await queryInterface.createTable("MetaAgentPlans", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE"
        },
        userId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "Users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT"
        },
        whatsappId: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "Whatsapps", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL"
        },
        resolvedAdAccountId: {
          type: DataTypes.STRING(64),
          allowNull: true
        },
        resolvedMode: {
          type: DataTypes.STRING(20),
          allowNull: true,
          comment: "whatsapp | company_settings"
        },
        prompt: {
          type: DataTypes.TEXT,
          allowNull: false
        },
        summary: {
          type: DataTypes.TEXT,
          allowNull: true
        },
        proposedActions: {
          type: DataTypes.JSONB,
          allowNull: false,
          defaultValue: []
        },
        status: {
          type: DataTypes.STRING(20),
          allowNull: false,
          defaultValue: "pending",
          comment: "pending | executed | partial | expired | rejected"
        },
        expiresAt: {
          type: DataTypes.DATE,
          allowNull: false
        },
        executedAt: {
          type: DataTypes.DATE,
          allowNull: true
        },
        openaiUsage: {
          type: DataTypes.JSONB,
          allowNull: true,
          comment: "{ promptTokens, completionTokens, totalTokens, model }"
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

      await queryInterface.addIndex("MetaAgentPlans", ["companyId", "createdAt"], {
        name: "idx_meta_agent_plans_company_created"
      });
      await queryInterface.addIndex("MetaAgentPlans", ["companyId", "status"], {
        name: "idx_meta_agent_plans_company_status"
      });
      await queryInterface.addIndex("MetaAgentPlans", ["companyId", "whatsappId"], {
        name: "idx_meta_agent_plans_company_wa"
      });
      await queryInterface.addIndex("MetaAgentPlans", ["expiresAt"], {
        name: "idx_meta_agent_plans_expires"
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("MetaAgentPlans");
  }
};
