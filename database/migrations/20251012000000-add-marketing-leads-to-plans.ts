import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.addColumn("Plans", "useMarketing", {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: true,
      }),
      queryInterface.addColumn("Plans", "useLeads", {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: true,
      }),
    ]);
  },

  down: (queryInterface: QueryInterface) => {
    return Promise.all([
      queryInterface.removeColumn("Plans", "useMarketing"),
      queryInterface.removeColumn("Plans", "useLeads"),
    ]);
  },
};
