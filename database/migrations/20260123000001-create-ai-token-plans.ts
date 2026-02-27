import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableExists = await queryInterface.showAllTables().then(tables =>
      tables.includes("AiTokenPlans")
    );

    if (!tableExists) {
      await queryInterface.createTable("AiTokenPlans", {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false
        },
        code: {
          type: DataTypes.STRING(40),
          allowNull: true,
          unique: true,
          comment: "Identificador único del plan"
        },
        name: {
          type: DataTypes.STRING(50),
          allowNull: false,
          comment: "Nombre del plan"
        },
        priceUsd: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          comment: "Precio en USD"
        },
        tokens: {
          type: DataTypes.BIGINT,
          allowNull: false,
          comment: "Cantidad de tokens incluidos"
        },
        isRecurring: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          comment: "Si es plan recurrente por defecto"
        },
        stripePriceIdOneTime: {
          type: DataTypes.STRING(120),
          allowNull: true,
          comment: "Stripe Price ID para compra única"
        },
        stripePriceIdRecurring: {
          type: DataTypes.STRING(120),
          allowNull: true,
          comment: "Stripe Price ID para suscripción mensual"
        },
        stripeProductId: {
          type: DataTypes.STRING(120),
          allowNull: true,
          comment: "Stripe Product ID"
        },
        isActive: {
          type: DataTypes.BOOLEAN,
          defaultValue: true,
          comment: "Si el plan está activo para compra"
        },
        isArchived: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          comment: "Si el plan está archivado"
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
          comment: "Descripción del plan"
        },
        features: {
          type: DataTypes.JSONB,
          allowNull: true,
          comment: "Características adicionales del plan"
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

      console.log("✅ Table AiTokenPlans created successfully");
    } else {
      console.log("ℹ️ Table AiTokenPlans already exists, skipping creation");
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AiTokenPlans");
  }
};
