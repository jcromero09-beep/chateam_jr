import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    // Agregar campos para metadata de agentes IA
    await queryInterface.addColumn("Messages", "agentUsed", {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "Agente IA que generó este mensaje (supervisor, rag, support, sales, etc.)"
    });

    await queryInterface.addColumn("Messages", "intent", {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "Intención detectada por el clasificador del SupervisorService"
    });

    await queryInterface.addColumn("Messages", "confidenceScore", {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
      comment: "Puntuación de confianza de la respuesta del agente IA (0-1)"
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Messages", "confidenceScore");
    await queryInterface.removeColumn("Messages", "intent");
    await queryInterface.removeColumn("Messages", "agentUsed");
  }
};
