import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Check if column exists before adding
    const tableDescription = await queryInterface.describeTable("Chats");

    if (!tableDescription.uuid) {
      await queryInterface.addColumn("Chats", "uuid", {
        type: DataTypes.STRING,
        allowNull: true,
        defaultValue: null
      });

      console.log("✓ Column 'uuid' added to Chats table");
    } else {
      console.log("✓ Column 'uuid' already exists in Chats table");
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Chats", "uuid");
  }
};
