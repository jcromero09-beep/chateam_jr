import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Verificar si la columna aiTokenBalance ya existe
    const tableDescription = await queryInterface.describeTable("Companies");

    if (!tableDescription.aiTokenBalance) {
      await queryInterface.addColumn("Companies", "aiTokenBalance", {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
      });
    }

    if (!tableDescription.activeAISubplanId) {
      await queryInterface.addColumn("Companies", "activeAISubplanId", {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: "AISubplans",
          key: "id"
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      });
    }
  },

  down: async (queryInterface: QueryInterface) => {
    const tableDescription = await queryInterface.describeTable("Companies");

    if (tableDescription.aiTokenBalance) {
      await queryInterface.removeColumn("Companies", "aiTokenBalance");
    }

    if (tableDescription.activeAISubplanId) {
      await queryInterface.removeColumn("Companies", "activeAISubplanId");
    }
  }
};
