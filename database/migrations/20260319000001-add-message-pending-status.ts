import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.addColumn("Messages", "messageStatus", {
        type: DataTypes.ENUM("pending", "sent", "failed", "deleted"),
        defaultValue: "pending",
        allowNull: false
      }),
      queryInterface.addColumn("Messages", "sendAttempts", {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false
      }),
      queryInterface.addColumn("Messages", "sentAt", {
        type: DataTypes.DATE(6),
        allowNull: true
      })
    ]);
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeColumn("Messages", "messageStatus"),
      queryInterface.removeColumn("Messages", "sendAttempts"),
      queryInterface.removeColumn("Messages", "sentAt")
    ]);
  }
};
