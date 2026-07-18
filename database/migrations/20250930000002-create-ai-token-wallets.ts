import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.createTable("AiTokenWallets", {
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
        comment: "ID de la empresa propietaria del wallet"
      },
      balance: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: "Saldo actual de tokens disponibles"
      },
      totalPurchased: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: "Total de tokens comprados históricamente"
      },
      totalConsumed: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: "Total de tokens consumidos históricamente"
      },
      lastPurchaseAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: "Fecha de última compra"
      },
      lowBalanceAlertSent: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: "Si se envió alerta de saldo bajo"
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

    // Índices
    await queryInterface.addIndex("AiTokenWallets", ["companyId"], {
      name: "ai_token_wallets_company_idx",
      unique: true
    });

    await queryInterface.addIndex("AiTokenWallets", ["balance"], {
      name: "ai_token_wallets_balance_idx"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AiTokenWallets");
  }
};