import { QueryInterface, DataTypes } from "sequelize";

/**
 * Agrega columnas para comentarios FB/IG a la tabla Whatsapps:
 * - pageAccessToken: Page Access Token de la página de Facebook
 * - instagramBusinessAccountId: ID de la cuenta business de Instagram vinculada
 *
 * BD SAGRADA: solo ADD COLUMN, idempotente, sin DROP.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableName = "Whatsapps";
    const table = await queryInterface.describeTable(tableName);

    if (!table.pageAccessToken) {
      await queryInterface.addColumn(tableName, "pageAccessToken", {
        type: DataTypes.TEXT,
        allowNull: true
      });
    }

    if (!table.instagramBusinessAccountId) {
      await queryInterface.addColumn(tableName, "instagramBusinessAccountId", {
        type: DataTypes.TEXT,
        allowNull: true
      });
    }
  },

  down: async (): Promise<void> => {
    // BD SAGRADA: no eliminar columnas en producción.
  }
};
