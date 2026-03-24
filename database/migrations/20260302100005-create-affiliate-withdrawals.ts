import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableExists = await queryInterface.showAllTables()
      .then((tables: string[]) => tables.includes("AffiliateWithdrawals"));

    if (!tableExists) {
      await queryInterface.createTable("AffiliateWithdrawals", {
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
        affiliateId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "AIAffiliatePrograms", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "CASCADE",
        },
        amount: {
          type: DataTypes.DECIMAL(12, 2),
          allowNull: false,
        },
        fee: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0,
        },
        netAmount: {
          type: DataTypes.DECIMAL(12, 2),
          allowNull: false,
        },
        paymentMethod: {
          type: DataTypes.STRING(30),
          allowNull: false,
        },
        paymentDetails: {
          type: DataTypes.JSONB,
          allowNull: true,
        },
        status: {
          type: DataTypes.STRING(20),
          allowNull: false,
          defaultValue: "requested",
        },
        requestedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        processedAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        processedBy: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: "Users", key: "id" },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        rejectionReason: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        transactionRef: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      });

      await queryInterface.addIndex("AffiliateWithdrawals", ["companyId", "status"], {
        name: "idx_affiliate_withdrawals_company_status",
      });

      await queryInterface.addIndex("AffiliateWithdrawals", ["walletId", "status"], {
        name: "idx_affiliate_withdrawals_wallet_status",
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AffiliateWithdrawals").catch(() => {});
  },
};
