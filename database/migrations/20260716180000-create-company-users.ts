import { QueryInterface, DataTypes } from "sequelize";

/**
 * [Multi-empresa] Membresías usuario↔empresa: una identidad global (email único)
 * puede pertenecer a N empresas con rol (profile) distinto por empresa.
 * La tabla se creó primero por DDL en prod y se respaldó con backfill
 * (1 membresía por usuario desde Users.companyId). Esta migración deja el
 * esquema reproducible en otros entornos.
 */
export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("CompanyUsers", {
      id: {
        type: DataTypes.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      profile: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "user"
      },
      roleId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Roles", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      },
      active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await queryInterface.addConstraint("CompanyUsers", {
      fields: ["userId", "companyId"],
      type: "unique",
      name: "uq_companyusers_user_company"
    });
    await queryInterface.addIndex("CompanyUsers", ["userId"]);
    await queryInterface.addIndex("CompanyUsers", ["companyId"]);

    // Backfill: cada usuario existente -> 1 membresía (su empresa/rol actual).
    await queryInterface.sequelize.query(`
      INSERT INTO "CompanyUsers" ("userId","companyId",profile,"roleId","createdAt","updatedAt")
      SELECT id, "companyId", COALESCE(profile,'user'), "roleId", now(), now()
      FROM "Users" WHERE "companyId" IS NOT NULL
      ON CONFLICT ("userId","companyId") DO NOTHING;
    `);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("CompanyUsers");
  }
};
