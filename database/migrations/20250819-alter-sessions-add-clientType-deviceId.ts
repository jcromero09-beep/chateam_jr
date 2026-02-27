import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Sessions", "clientType", {
      type: DataTypes.ENUM("web", "app"),
      allowNull: false,
      defaultValue: "web"
    });
    await queryInterface.addColumn("Sessions", "deviceId", {
      type: DataTypes.STRING(128),
      allowNull: true
    });
    await queryInterface.addColumn("Sessions", "lastSeenAt", {
      type: DataTypes.DATE,
      allowNull: true
    });

    await queryInterface.addIndex("Sessions", ["userId", "clientType"]);
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeIndex("Sessions", ["userId", "clientType"]);
    await queryInterface.removeColumn("Sessions", "lastSeenAt");
    await queryInterface.removeColumn("Sessions", "deviceId");
    await queryInterface.removeColumn("Sessions", "clientType");
  }
};
