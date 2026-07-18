import { QueryInterface, DataTypes } from "sequelize";

/**
 * [Multi-empresa · F4.2] Colas por membresía: qué colas ve un usuario en cada
 * empresa. admin/super ignoran esta tabla (ven todas las colas de la empresa).
 */
export default {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("CompanyUserQueues", {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true, allowNull: false },
      companyUserId: {
        type: DataTypes.BIGINT,
        allowNull: false,
        references: { model: "CompanyUsers", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      queueId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Queues", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE"
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false }
    });
    await queryInterface.addConstraint("CompanyUserQueues", {
      fields: ["companyUserId", "queueId"],
      type: "unique",
      name: "uq_cuq"
    });
    await queryInterface.addIndex("CompanyUserQueues", ["companyUserId"]);
  },
  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("CompanyUserQueues");
  }
};
