import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const columns = await queryInterface.describeTable("Tags");

    if (!columns["aiGuidance1"]) {
      await queryInterface.addColumn("Tags", "aiGuidance1", {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Prompt de contexto IA para mensaje de seguimiento 1",
      });
      console.log("✅ Columna aiGuidance1 agregada a Tags");
    } else {
      console.log("⏭️ Columna aiGuidance1 ya existe en Tags, skip");
    }

    if (!columns["aiGuidance2"]) {
      await queryInterface.addColumn("Tags", "aiGuidance2", {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Prompt de contexto IA para mensaje de seguimiento 2",
      });
      console.log("✅ Columna aiGuidance2 agregada a Tags");
    } else {
      console.log("⏭️ Columna aiGuidance2 ya existe en Tags, skip");
    }

    if (!columns["aiGuidance3"]) {
      await queryInterface.addColumn("Tags", "aiGuidance3", {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Prompt de contexto IA para mensaje de seguimiento 3",
      });
      console.log("✅ Columna aiGuidance3 agregada a Tags");
    } else {
      console.log("⏭️ Columna aiGuidance3 ya existe en Tags, skip");
    }
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Tags", "aiGuidance1");
    await queryInterface.removeColumn("Tags", "aiGuidance2");
    await queryInterface.removeColumn("Tags", "aiGuidance3");
    console.log("✅ Columnas aiGuidance eliminadas de Tags");
  },
};
