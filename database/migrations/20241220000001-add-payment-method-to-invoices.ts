import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Agregar campo paymentMethod
    await queryInterface.addColumn("Invoices", "paymentMethod", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    });

    // Agregar campo paypalOrderId
    await queryInterface.addColumn("Invoices", "paypalOrderId", {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Invoices", "paymentMethod");
    await queryInterface.removeColumn("Invoices", "paypalOrderId");
  }
};
