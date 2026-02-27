import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable('LeadSources', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      leadId: {
        type: DataTypes.STRING,
        allowNull: false,
        references: { model: 'Contacts', key: 'id' }
      },
      utmSource: {
        type: DataTypes.STRING,
        allowNull: true
      },
      utmMedium: {
        type: DataTypes.STRING,
        allowNull: true
      },
      utmCampaign: {
        type: DataTypes.STRING,
        allowNull: true
      },
      utmContent: {
        type: DataTypes.STRING,
        allowNull: true
      },
      fbclid: {
        type: DataTypes.STRING,
        allowNull: true
      },
      campaignId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      adsetId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      adId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      sourceKind: {
        type: DataTypes.ENUM('meta', 'organico', 'marketplace', 'referido', 'desconocido'),
        allowNull: false,
        defaultValue: 'desconocido'
      },
      vendorId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      marketplaceName: {
        type: DataTypes.STRING,
        allowNull: true
      },
      manualOverrideBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' }
      },
      manualOverrideAt: {
        type: DataTypes.DATE,
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
    });

    await queryInterface.addIndex('LeadSources', ['leadId']);
    await queryInterface.addIndex('LeadSources', ['campaignId']);
    await queryInterface.addIndex('LeadSources', ['adId']);
    await queryInterface.addIndex('LeadSources', ['sourceKind']);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable('LeadSources');
  }
};