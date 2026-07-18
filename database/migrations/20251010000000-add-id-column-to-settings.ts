import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // First, add the id column as nullable
    await queryInterface.addColumn("Settings", "id", {
      type: DataTypes.INTEGER,
      allowNull: true,
      autoIncrement: true
    });

    // Generate IDs for existing records
    await queryInterface.sequelize.query(`
      UPDATE "Settings" SET "id" = nextval('"Settings_id_seq"'::regclass)
      WHERE "id" IS NULL;
    `);

    // Make id not nullable and set as primary key
    await queryInterface.changeColumn("Settings", "id", {
      type: DataTypes.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true
    });

    // Drop the old primary key constraint on 'key'
    await queryInterface.removeConstraint("Settings", "Settings_pkey");

    // Add new primary key constraint on 'id'
    await queryInterface.addConstraint("Settings", {
      fields: ["id"],
      type: "primary key",
      name: "Settings_pkey"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    // Remove the new primary key constraint
    await queryInterface.removeConstraint("Settings", "Settings_pkey");

    // Drop the id column
    await queryInterface.removeColumn("Settings", "id");

    // Restore the old primary key constraint on 'key'
    await queryInterface.addConstraint("Settings", {
      fields: ["key"],
      type: "primary key",
      name: "Settings_pkey"
    });
  }
};