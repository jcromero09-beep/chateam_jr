import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.createTable("CampaignRecommendations", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      companyId: {
        type: DataTypes.INTEGER,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false
      },
      campaignId: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: "ID de Facebook guardado como STRING para evitar perdida de precision"
      },
      campaignName: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      type: {
        type: DataTypes.ENUM("optimization", "warning", "opportunity", "insight"),
        allowNull: false,
        defaultValue: "optimization"
      },
      priority: {
        type: DataTypes.ENUM("critical", "high", "medium", "low"),
        allowNull: false,
        defaultValue: "medium"
      },
      category: {
        type: DataTypes.ENUM("timing", "content", "segmentation", "budget", "channel"),
        allowNull: false,
        defaultValue: "content"
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      impact: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      effort: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      potentialGain: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      actionData: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "Datos estructurados para aplicar la recomendacion"
      },
      status: {
        type: DataTypes.ENUM("active", "applied", "dismissed"),
        allowNull: false,
        defaultValue: "active"
      },
      appliedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      appliedBy: {
        type: DataTypes.INTEGER,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    }).then(() => {
      return queryInterface.addIndex("CampaignRecommendations", ["companyId"]);
    }).then(() => {
      return queryInterface.addIndex("CampaignRecommendations", ["campaignId"]);
    }).then(() => {
      return queryInterface.addIndex("CampaignRecommendations", ["status"]);
    });
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.dropTable("CampaignRecommendations");
  }
};
