import { QueryInterface, DataTypes } from "sequelize";

const addColumnIfMissing = async (
  queryInterface: QueryInterface,
  tableDescription: Record<string, unknown>,
  tableName: string,
  columnName: string,
  definition: any
) => {
  if (!tableDescription[columnName]) {
    await queryInterface.addColumn(tableName, columnName, definition);
  }
};

const removeColumnIfExists = async (
  queryInterface: QueryInterface,
  tableDescription: Record<string, unknown>,
  tableName: string,
  columnName: string
) => {
  if (tableDescription[columnName]) {
    await queryInterface.removeColumn(tableName, columnName);
  }
};

/**
 * Migración: Permisos y mensajes automáticos por conexión.
 *
 * Agrega 4 columnas a la tabla Whatsapps que permiten override por conexión
 * de los settings globales. Valor null = "heredar de Settings global".
 *
 * BD SAGRADA: Solo ADD COLUMN (idempotente). El down respeta el orden inverso.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const whatsapps = await queryInterface.describeTable("Whatsapps");

    // Override del switch global de NPS (Settings.userRating)
    // null = heredar | true = forzar activo | false = forzar inactivo
    await addColumnIfMissing(queryInterface, whatsapps, "Whatsapps", "npsEnabled", {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: null
    });

    // Override del switch global de aceptar audio (Settings.acceptAudioMessageContact)
    await addColumnIfMissing(queryInterface, whatsapps, "Whatsapps", "acceptAudio", {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      defaultValue: null
    });

    // Mensaje cuando se rechaza una llamada entrante (Baileys)
    await addColumnIfMissing(queryInterface, whatsapps, "Whatsapps", "callRejectMessage", {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: ""
    });

    // Mensaje al cliente cuando la conexión no acepta audios
    await addColumnIfMissing(queryInterface, whatsapps, "Whatsapps", "rejectAudioMessage", {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: ""
    });
  },

  down: async (queryInterface: QueryInterface) => {
    const whatsapps = await queryInterface.describeTable("Whatsapps");
    const columns = [
      "rejectAudioMessage",
      "callRejectMessage",
      "acceptAudio",
      "npsEnabled"
    ];
    for (const col of columns) {
      await removeColumnIfExists(queryInterface, whatsapps, "Whatsapps", col);
    }
  }
};
