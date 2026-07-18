import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const plans = await queryInterface.describeTable("Plans");

    if (!plans.allowRecurringPayments) {
      await queryInterface.addColumn("Plans", "allowRecurringPayments", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const plans = await queryInterface.describeTable("Plans");

    if (plans.allowRecurringPayments) {
      await queryInterface.removeColumn("Plans", "allowRecurringPayments");
    }
  }
};
