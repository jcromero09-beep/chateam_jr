import { QueryInterface, DataTypes } from "sequelize";

const addColumnIfMissing = async (
  queryInterface: QueryInterface,
  tableDescription: Record<string, unknown>,
  columnName: string,
  definition: any
) => {
  if (!tableDescription[columnName]) {
    await queryInterface.addColumn("Receipts", columnName, definition);
  }
};

const removeColumnIfExists = async (
  queryInterface: QueryInterface,
  tableDescription: Record<string, unknown>,
  columnName: string
) => {
  if (tableDescription[columnName]) {
    await queryInterface.removeColumn("Receipts", columnName);
  }
};

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const receipts = await queryInterface.describeTable("Receipts");

    await addColumnIfMissing(queryInterface, receipts, "purchaseType", {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "subscription"
    });

    await addColumnIfMissing(queryInterface, receipts, "planId", {
      type: DataTypes.INTEGER,
      allowNull: true
    });

    await addColumnIfMissing(queryInterface, receipts, "planName", {
      type: DataTypes.STRING,
      allowNull: true
    });

    await addColumnIfMissing(queryInterface, receipts, "totalPrice", {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    });

    await addColumnIfMissing(queryInterface, receipts, "duration", {
      type: DataTypes.STRING,
      allowNull: true
    });

    await addColumnIfMissing(queryInterface, receipts, "aiSubplanId", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "AISubplans", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });

    await addColumnIfMissing(queryInterface, receipts, "aiTokens", {
      type: DataTypes.BIGINT,
      allowNull: true
    });

    await addColumnIfMissing(queryInterface, receipts, "amountUsd", {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true
    });

    await addColumnIfMissing(queryInterface, receipts, "processedBy", {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "Users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL"
    });

    await addColumnIfMissing(queryInterface, receipts, "processedAt", {
      type: DataTypes.DATE,
      allowNull: true
    });

    await addColumnIfMissing(queryInterface, receipts, "rejectionReason", {
      type: DataTypes.TEXT,
      allowNull: true
    });

    const companies = await queryInterface.describeTable("Companies");
    if (!companies.aiTokensPurchased) {
      await queryInterface.addColumn("Companies", "aiTokensPurchased", {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const receipts = await queryInterface.describeTable("Receipts");
    const receiptColumns = [
      "rejectionReason",
      "processedAt",
      "processedBy",
      "amountUsd",
      "aiTokens",
      "aiSubplanId",
      "duration",
      "totalPrice",
      "planName",
      "planId",
      "purchaseType"
    ];

    for (const columnName of receiptColumns) {
      await removeColumnIfExists(queryInterface, receipts, columnName);
    }

    const companies = await queryInterface.describeTable("Companies");
    if (companies.aiTokensPurchased) {
      await queryInterface.removeColumn("Companies", "aiTokensPurchased");
    }
  }
};
