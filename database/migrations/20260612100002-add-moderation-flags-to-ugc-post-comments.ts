import { QueryInterface, DataTypes } from "sequelize";

/**
 * Agrega flags de moderación FB/IG a UGCPostComments:
 * - isHidden: comentario oculto vía Graph API (is_hidden / hide)
 * - isDeleted: marcado como borrado en la plataforma (soft flag — BD SAGRADA)
 *
 * Solo ADD COLUMN, idempotente, sin DROP.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableName = "UGCPostComments";
    const table = await queryInterface.describeTable(tableName);

    if (!table.isHidden) {
      await queryInterface.addColumn(tableName, "isHidden", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }

    if (!table.isDeleted) {
      await queryInterface.addColumn(tableName, "isDeleted", {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
  },

  down: async (): Promise<void> => {
    // BD SAGRADA: no eliminar columnas en producción.
  }
};
