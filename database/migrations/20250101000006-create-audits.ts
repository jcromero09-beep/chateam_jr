import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable('Audits', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      campaignId: {
        type: DataTypes.STRING,
        allowNull: false
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Companies', key: 'id' }
      },
      timeWindowSince: {
        type: DataTypes.DATE,
        allowNull: false
      },
      timeWindowUntil: {
        type: DataTypes.DATE,
        allowNull: false
      },
      level: {
        type: DataTypes.ENUM('campaign', 'adset', 'ad'),
        allowNull: false
      },
      reportData: {
        type: DataTypes.JSONB,
        allowNull: false
      },
      csvAggregateUrl: {
        type: DataTypes.STRING,
        allowNull: true
      },
      csvCountryUrl: {
        type: DataTypes.STRING,
        allowNull: true
      },
      csvPlacementUrl: {
        type: DataTypes.STRING,
        allowNull: true
      },
      overallScore: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      status: {
        type: DataTypes.ENUM('pending', 'completed', 'failed'),
        defaultValue: 'pending'
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

    await queryInterface.addIndex('Audits', ['campaignId']);
    await queryInterface.addIndex('Audits', ['companyId']);
    await queryInterface.addIndex('Audits', ['createdAt']);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable('Audits');
  }
};