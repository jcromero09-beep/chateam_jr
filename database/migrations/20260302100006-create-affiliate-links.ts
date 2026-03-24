import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableExists = await queryInterface.showAllTables()
      .then((tables: string[]) => tables.includes("AffiliateLinks"));

    if (!tableExists) {
      await queryInterface.createTable("AffiliateLinks", {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        affiliateId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: "AIAffiliatePrograms", key: "id" },
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
        slug: {
          type: DataTypes.STRING(50),
          allowNull: false,
          unique: true,
        },
        targetUrl: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        source: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        medium: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        clicks: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        conversions: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
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

      await queryInterface.addIndex("AffiliateLinks", ["slug"], {
        name: "idx_affiliate_links_slug",
        unique: true,
      });

      await queryInterface.addIndex("AffiliateLinks", ["affiliateId"], {
        name: "idx_affiliate_links_affiliate",
      });

      await queryInterface.addIndex("AffiliateLinks", ["companyId"], {
        name: "idx_affiliate_links_company",
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AffiliateLinks").catch(() => {});
  },
};
