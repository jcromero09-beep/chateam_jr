import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable('Invoices', {
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
      stripeInvoiceId: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
      },
      stripePaymentIntentId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      stripeChargeId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      status: {
        type: DataTypes.STRING,
        allowNull: true
      },
      amountDue: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      amountPaid: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      currency: {
        type: DataTypes.STRING,
        allowNull: true
      },
      hostedInvoiceUrl: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      invoicePdf: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      paidAt: {
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

    await queryInterface.addIndex('Invoices', ['companyId']);
    await queryInterface.addIndex('Invoices', ['stripeInvoiceId']);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable('Invoices');
  }
};