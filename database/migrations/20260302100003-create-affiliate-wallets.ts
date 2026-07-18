import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableExists = await queryInterface.showAllTables()
      .then((tables: string[]) => tables.includes("AffiliateWallets"));

    if (!tableExists) {
      await queryInterface.createTable("AffiliateWallets", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
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
        availableBalance: {
          type: DataTypes.DECIMAL(12, 2),
          allowNull: false,
          defaultValue: 0,
        },
        pendingBalance: {
          type: DataTypes.DECIMAL(12, 2),
          allowNull: false,
          defaultValue: 0,
        },
        totalEarned: {
          type: DataTypes.DECIMAL(12, 2),
          allowNull: false,
          defaultValue: 0,
        },
        totalWithdrawn: {
          type: DataTypes.DECIMAL(12, 2),
          allowNull: false,
          defaultValue: 0,
        },
        currency: {
          type: DataTypes.STRING(3),
          allowNull: false,
          defaultValue: "USD",
        },
        status: {
          type: DataTypes.STRING(20),
          allowNull: false,
          defaultValue: "active",
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

      await queryInterface.addIndex("AffiliateWallets", ["companyId", "affiliateId"], {
        name: "idx_affiliate_wallets_company_affiliate",
        unique: true,
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AffiliateWallets").catch(() => {});
  },
};
