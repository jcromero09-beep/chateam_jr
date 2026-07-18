import { DataTypes, QueryInterface } from "sequelize";

export default {
  up: async (queryInterface: QueryInterface): Promise<void> => {
    await queryInterface.changeColumn("AiTokenTransactions", "amountUsd", {
      type: DataTypes.DECIMAL(18, 10),
      allowNull: true,
      comment: "Costo USD de compras o consumo con precisión para micro-peticiones"
    });
  },

  down: async (): Promise<void> => {
    // Aditiva: no reducir precisión automáticamente para evitar pérdida de datos.
  }
};
