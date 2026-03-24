import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("AICreditBalances", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      companyId: {
        type: DataTypes.INTEGER,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false,
        comment: "Empresa propietaria del balance"
      },
      creditTypeId: {
        type: DataTypes.INTEGER,
        references: { model: "AICreditTypes", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        allowNull: false,
        comment: "Tipo de crédito asociado"
      },
      totalCredits: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: false,
        defaultValue: 0,
        comment: "Total de créditos asignados"
      },
      usedCredits: {
        type: DataTypes.DECIMAL(15, 4),
        allowNull: false,
        defaultValue: 0,
        comment: "Créditos consumidos"
      },
      resetAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Fecha del próximo reseteo de créditos"
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

    // Constraint UNIQUE compuesto: una empresa solo tiene un balance por tipo de crédito
    await queryInterface.addConstraint("AICreditBalances", {
      fields: ["companyId", "creditTypeId"],
      type: "unique",
      name: "ai_credit_balances_company_credit_type_unique"
    });

    // Índice por companyId para multi-tenancy
    await queryInterface.addIndex("AICreditBalances", ["companyId"], {
      name: "ai_credit_balances_company_id_idx"
    });

    console.log("✅ Tabla AICreditBalances creada exitosamente");
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AICreditBalances");
  }
};
