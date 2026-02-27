import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.addColumn("ChatMessages", "isPinned", {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false
      }),
      queryInterface.addColumn("ChatMessages", "companyId", {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "Companies",
          key: "id"
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      })
    ]);
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeColumn("ChatMessages", "isPinned"),
      queryInterface.removeColumn("ChatMessages", "companyId")
    ]);
  }
};
