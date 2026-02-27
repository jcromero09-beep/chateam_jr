import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable('CompanyBilling', {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Companies', key: 'id' }
      },
      stripeCustomerId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      stripeSubscriptionId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      stripePriceId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      status: {
        type: DataTypes.STRING,
        allowNull: true
      },
      currentPeriodStart: {
        type: DataTypes.DATE,
        allowNull: true
      },
      currentPeriodEnd: {
        type: DataTypes.DATE,
        allowNull: true
      },
      cancelAtPeriodEnd: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      cancelAt: {
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

    await queryInterface.addIndex('CompanyBilling', ['companyId']);
    await queryInterface.addIndex('CompanyBilling', ['stripeCustomerId']);
    await queryInterface.addIndex('CompanyBilling', ['stripeSubscriptionId']);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable('CompanyBilling');
  }
};