import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableExists = await queryInterface.showAllTables()
      .then((tables: string[]) => tables.includes("AffiliateTransactions"));

    if (!tableExists) {
      await queryInterface.createTable("AffiliateTransactions", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        walletId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "AffiliateWallets", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        companyId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "Companies", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        type: {
          type: DataTypes.STRING(30),
          allowNull: false,
        },
        amount: {
          type: DataTypes.DECIMAL(12, 2),
          allowNull: false,
        },
        balanceBefore: {
          type: DataTypes.DECIMAL(12, 2),
          allowNull: false,
          defaultValue: 0,
        },
        balanceAfter: {
          type: DataTypes.DECIMAL(12, 2),
          allowNull: false,
          defaultValue: 0,
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        referenceType: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        referenceId: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        metadata: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      });

      await queryInterface.addIndex("AffiliateTransactions", ["walletId", "createdAt"], {
        name: "idx_affiliate_transactions_wallet_date",
      });

      await queryInterface.addIndex("AffiliateTransactions", ["companyId", "type"], {
        name: "idx_affiliate_transactions_company_type",
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AffiliateTransactions").catch(() => {});
  },
};
