import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const columns = await queryInterface.describeTable("Whatsapps");

    if (!columns["receiveChannel"]) {
      await queryInterface.addColumn("Whatsapps", "receiveChannel", {
        type: DataTypes.STRING(20),
        defaultValue: "both",
        allowNull: true,
        comment: "meta | baileys | both"
      });
    }

    if (!columns["sendChannel"]) {
      await queryInterface.addColumn("Whatsapps", "sendChannel", {
        type: DataTypes.STRING(20),
        defaultValue: "baileys",
        allowNull: true,
        comment: "meta | baileys"
      });
    }

    if (!columns["linkedWhatsappId"]) {
      await queryInterface.addColumn("Whatsapps", "linkedWhatsappId", {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Whatsapps", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL"
      });
    }
  },

  down: async (_queryInterface: QueryInterface) => {
    // BD sagrada: no se eliminan columnas en rollback.
  }
};
