import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableExists = await queryInterface.showAllTables()
      .then((tables: string[]) => tables.includes("AffiliateTiers"));

    if (!tableExists) {
      await queryInterface.createTable("AffiliateTiers", {
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
        name: {
          type: DataTypes.STRING(50),
          allowNull: false,
        },
        level: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 1,
        },
        commissionRate: {
          type: DataTypes.DECIMAL(5, 2),
          allowNull: false,
          defaultValue: 10.0,
        },
        level2Rate: {
          type: DataTypes.DECIMAL(5, 2),
          allowNull: false,
          defaultValue: 0,
        },
        level3Rate: {
          type: DataTypes.DECIMAL(5, 2),
          allowNull: false,
          defaultValue: 0,
        },
        minReferrals: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        minEarnings: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0,
        },
        bonusRate: {
          type: DataTypes.DECIMAL(5, 2),
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

      await queryInterface.addIndex("AffiliateTiers", ["companyId", "level"], {
        name: "idx_affiliate_tiers_company_level",
        unique: true,
      });
    }

    // Agregar FK tierId en AIAffiliatePrograms ahora que la tabla existe
    const progTable = await queryInterface.describeTable("AIAffiliatePrograms");
    if (progTable["tierId"]) {
      await queryInterface.addConstraint("AIAffiliatePrograms", {
        fields: ["tierId"],
        type: "foreign key",
        name: "fk_affiliate_programs_tier",
        references: { table: "AffiliateTiers", field: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      }).catch(() => {}); // Ignorar si ya existe
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeConstraint("AIAffiliatePrograms", "fk_affiliate_programs_tier").catch(() => {});
    await queryInterface.dropTable("AffiliateTiers").catch(() => {});
  },
};
