import { QueryInterface, DataTypes } from "sequelize";

const DEFAULT_MESSAGE_CREATED =
  "Hola {{clientName}}, tu cita para {{service}} fue creada para el {{date}} a las {{time}} con {{agent}}.";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("reminder_templates");

    if (!tableDesc["messageCreated"]) {
      await queryInterface.addColumn("reminder_templates", "messageCreated", {
        type: DataTypes.TEXT,
        allowNull: true
      });
    }

    await queryInterface.sequelize.query(
      `UPDATE "reminder_templates"
          SET "messageCreated" = :defaultMessage
        WHERE "messageCreated" IS NULL
           OR "messageCreated" = ''`,
      {
        replacements: {
          defaultMessage: DEFAULT_MESSAGE_CREATED
        }
      }
    );
  },

  down: async (queryInterface: QueryInterface) => {
    const tableDesc = await queryInterface.describeTable("reminder_templates");

    if (tableDesc["messageCreated"]) {
      await queryInterface.removeColumn("reminder_templates", "messageCreated");
    }
  }
};
