import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.changeColumn("Schedules", "ticketId", {
      type: DataTypes.INTEGER,
      references: { model: "Tickets", key: "id" },
      onUpdate: "SET NULL",
      onDelete: "SET NULL",
      allowNull: true
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.changeColumn("Schedules", "ticketId", {
      type: DataTypes.INTEGER,
      references: { model: "Tickets", key: "id" },
      onUpdate: "SET NULL",
      onDelete: "SET NULL",
      allowNull: false
    });
  }
};
