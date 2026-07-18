import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("AiTokenTransactions", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Companies",
          key: "id"
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        comment: "ID de la empresa"
      },
      planId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "AiTokenPlans",
          key: "id"
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        comment: "ID del plan comprado (null para consumos)"
      },
      type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: "Tipo: purchase, usage, refund, bonus, adjust"
      },
      tokens: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: "Cantidad de tokens (positivo para crédito, negativo para débito)"
      },
      amountUsd: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        comment: "Monto en USD (solo para compras)"
      },
      module: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "Módulo que consumió: chat, flow, classification, campaigns, etc."
      },
      referenceId: {
        type: DataTypes.STRING(120),
        allowNull: true,
        comment: "ID de referencia (ticketId, messageId, flowId, etc.)"
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Users",
          key: "id"
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        comment: "Usuario que realizó la acción"
      },
      stripeSessionId: {
        type: DataTypes.STRING(120),
        allowNull: true,
        comment: "Stripe Checkout Session ID"
      },
      stripeSubscriptionId: {
        type: DataTypes.STRING(120),
        allowNull: true,
        comment: "Stripe Subscription ID (para recurrentes)"
      },
      meta: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "Metadata adicional (detalles de uso, configuración, etc.)"
      },
      balanceAfter: {
        type: DataTypes.BIGINT,
        allowNull: true,
        comment: "Saldo después de la transacción"
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Descripción de la transacción"
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

    // Índices para optimización de consultas
    await queryInterface.addIndex("AiTokenTransactions", ["companyId", "createdAt"], {
      name: "ai_token_transactions_company_date_idx"
    });

    await queryInterface.addIndex("AiTokenTransactions", ["type"], {
      name: "ai_token_transactions_type_idx"
    });

    await queryInterface.addIndex("AiTokenTransactions", ["module"], {
      name: "ai_token_transactions_module_idx"
    });

    await queryInterface.addIndex("AiTokenTransactions", ["referenceId"], {
      name: "ai_token_transactions_reference_idx"
    });

    await queryInterface.addIndex("AiTokenTransactions", ["userId"], {
      name: "ai_token_transactions_user_idx"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AiTokenTransactions");
  }
};