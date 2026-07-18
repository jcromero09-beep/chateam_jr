import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("PlanCreditAllocations", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      planId: {
        type: DataTypes.INTEGER,
        references: { model: "Plans", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false,
        comment: "Plan al que pertenece esta asignacion de creditos"
      },
      creditTypeId: {
        type: DataTypes.INTEGER,
        references: { model: "AICreditTypes", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false,
        comment: "Tipo de credito asignado"
      },
      creditsPerCycle: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: false,
        defaultValue: 0,
        comment: "Cantidad de creditos asignados por ciclo de facturacion"
      },
      isUnlimited: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: "Si el tipo de credito es ilimitado para este plan"
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

    // Constraint UNIQUE: un plan solo tiene una asignacion por tipo de credito
    await queryInterface.addConstraint("PlanCreditAllocations", {
      fields: ["planId", "creditTypeId"],
      type: "unique",
      name: "plan_credit_allocations_plan_credit_type_unique"
    });

    // Indice por planId para consultas rapidas
    await queryInterface.addIndex("PlanCreditAllocations", ["planId"], {
      name: "plan_credit_allocations_plan_id_idx"
    });

    console.log("✅ Tabla PlanCreditAllocations creada exitosamente");
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("PlanCreditAllocations");
  }
};
