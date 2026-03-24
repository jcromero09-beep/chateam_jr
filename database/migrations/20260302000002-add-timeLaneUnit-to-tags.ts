import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const columns = await queryInterface.describeTable("Tags");

    if (!columns["timeLaneUnit"]) {
      await queryInterface.addColumn("Tags", "timeLaneUnit", {
        type: DataTypes.STRING(10),
        defaultValue: "hours",
        allowNull: false,
        comment: "Unidad de timeLane: minutes | hours | days (default: hours para compat)",
      });
      console.log("✅ Columna timeLaneUnit agregada a Tags (default: hours)");
    } else {
      console.log("⏭️ Columna timeLaneUnit ya existe en Tags, skip");
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tags", "timeLaneUnit");
  },
};
