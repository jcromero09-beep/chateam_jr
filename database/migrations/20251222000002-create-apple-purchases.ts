import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.createTable("ApplePurchases", {
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
        allowNull: false
      },
      planId: {
        type: DataTypes.INTEGER,
        references: { model: "Plans", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        allowNull: true
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      transactionId: {
        type: DataTypes.STRING,
        allowNull: false
      },
      originalTransactionId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      productId: {
        type: DataTypes.STRING,
        allowNull: false
      },
      bundleId: {
        type: DataTypes.STRING,
        allowNull: false
      },
      receiptData: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      platform: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'ios'
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending'
      },
      purchaseDate: {
        type: DataTypes.DATE,
        allowNull: true
      },
      expiresDate: {
        type: DataTypes.DATE,
        allowNull: true
      },
      verifiedAt: {
        type: DataTypes.DATE,
        allowNull: true
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
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.dropTable("ApplePurchases");
  }
};
