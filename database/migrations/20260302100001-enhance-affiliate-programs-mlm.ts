import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table = await queryInterface.describeTable("AIAffiliatePrograms");

    if (!table["parentAffiliateId"]) {
      await queryInterface.addColumn("AIAffiliatePrograms", "parentAffiliateId", {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "AIAffiliatePrograms", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    }

    if (!table["tierId"]) {
      await queryInterface.addColumn("AIAffiliatePrograms", "tierId", {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
    }

    if (!table["level"]) {
      await queryInterface.addColumn("AIAffiliatePrograms", "level", {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        allowNull: false,
      });
    }

    if (!table["paymentMethod"]) {
      await queryInterface.addColumn("AIAffiliatePrograms", "paymentMethod", {
        type: DataTypes.STRING(30),
        allowNull: true,
      });
    }

    if (!table["paymentDetails"]) {
      await queryInterface.addColumn("AIAffiliatePrograms", "paymentDetails", {
        type: DataTypes.JSONB,
        allowNull: true,
      });
    }

    if (!table["currency"]) {
      await queryInterface.addColumn("AIAffiliatePrograms", "currency", {
        type: DataTypes.STRING(3),
        defaultValue: "USD",
        allowNull: false,
      });
    }

    // Índice para el árbol MLM
    await queryInterface.addIndex("AIAffiliatePrograms", ["parentAffiliateId"], {
      name: "idx_affiliate_programs_parent",
      concurrently: true,
    }).catch(() => {}); // Ignorar si ya existe

    await queryInterface.addIndex("AIAffiliatePrograms", ["companyId", "status"], {
      name: "idx_affiliate_programs_company_status",
      concurrently: true,
    }).catch(() => {});

    // Mejorar AIAffiliateReferrals
    const refTable = await queryInterface.describeTable("AIAffiliateReferrals");

    if (!refTable["level"]) {
      await queryInterface.addColumn("AIAffiliateReferrals", "level", {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        allowNull: false,
      });
    }

    if (!refTable["sourceType"]) {
      await queryInterface.addColumn("AIAffiliateReferrals", "sourceType", {
        type: DataTypes.STRING(20),
        defaultValue: "signup",
        allowNull: false,
      });
    }

    await queryInterface.addIndex("AIAffiliateReferrals", ["affiliateId", "referredCompanyId"], {
      name: "idx_affiliate_referrals_affiliate_company",
      concurrently: true,
    }).catch(() => {});
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("AIAffiliatePrograms", "parentAffiliateId").catch(() => {});
    await queryInterface.removeColumn("AIAffiliatePrograms", "tierId").catch(() => {});
    await queryInterface.removeColumn("AIAffiliatePrograms", "level").catch(() => {});
    await queryInterface.removeColumn("AIAffiliatePrograms", "paymentMethod").catch(() => {});
    await queryInterface.removeColumn("AIAffiliatePrograms", "paymentDetails").catch(() => {});
    await queryInterface.removeColumn("AIAffiliatePrograms", "currency").catch(() => {});
    await queryInterface.removeColumn("AIAffiliateReferrals", "level").catch(() => {});
    await queryInterface.removeColumn("AIAffiliateReferrals", "sourceType").catch(() => {});
  },
};
