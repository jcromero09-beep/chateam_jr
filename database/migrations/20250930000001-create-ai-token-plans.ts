import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("AiTokenPlans", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      code: {
        type: DataTypes.STRING(40),
        allowNull: true,
        unique: true,
        comment: "Identificador único del plan (ej: starter_150k)"
      },
      name: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: "Nombre del plan (ej: Starter 150k)"
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
        comment: "Si el plan está archivado (oculto pero mantiene historial)"
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
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    });

    // Índices para optimización
    await queryInterface.addIndex("AiTokenPlans", ["code"], {
      name: "ai_token_plans_code_idx",
      unique: true
    });

    await queryInterface.addIndex("AiTokenPlans", ["isActive", "isArchived"], {
      name: "ai_token_plans_active_archived_idx"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AiTokenPlans");
  }
};