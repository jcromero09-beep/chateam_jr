import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Verificar si la tabla ya existe (idempotente)
    const tables = await queryInterface.showAllTables();
    if (tables.includes("AICreditTransactions")) {
      console.log("⏭️ Tabla AICreditTransactions ya existe, skip");
      return;
    }

    await queryInterface.createTable("AICreditTransactions", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Companies", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        comment: "Empresa propietaria de la transacción",
      },
      creditTypeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "AICreditTypes", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        comment: "Tipo de crédito asociado",
      },
      amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Cantidad de créditos de la transacción",
      },
      direction: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "debit",
        comment: "Dirección: debit (consumo) | credit (recarga)",
      },
      balanceBefore: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "usedCredits antes de la operación",
      },
      balanceAfter: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "usedCredits después de la operación",
      },
      source: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: "Origen: chatbot, email, image_gen, ugc_agent, social_post, video, manual, provision, reset, pack_purchase",
      },
      sourceId: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: "ID del recurso que generó el consumo",
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Descripción opcional de la transacción",
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        comment: "Usuario que originó la transacción (opcional)",
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });

    // Índices para consultas frecuentes
    await queryInterface.addIndex("AICreditTransactions", ["companyId"], {
      name: "idx_ait_company",
    });

    await queryInterface.addIndex("AICreditTransactions", ["creditTypeId"], {
      name: "idx_ait_credit_type",
    });

    await queryInterface.addIndex("AICreditTransactions", ["source"], {
      name: "idx_ait_source",
    });

    await queryInterface.addIndex("AICreditTransactions", ["createdAt"], {
      name: "idx_ait_created",
    });

    await queryInterface.addIndex("AICreditTransactions", ["companyId", "createdAt"], {
      name: "idx_ait_company_date",
    });

    console.log("✅ Tabla AICreditTransactions creada con 5 índices");
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.dropTable("AICreditTransactions");
  },
};
