import { QueryInterface, DataTypes } from "sequelize";

/**
 * [Fix schema drift] Añade la columna `awaiting` (INTEGER, nullable) a DialogChatBots.
 *
 * Contexto: models/DialogChatBots.ts:26 declara `awaiting: number` y
 * services/WbotServices/ChatBotListener.ts:58 la usa (`awaiting: 1`), pero la
 * columna NUNCA se creó en la tabla ni existía migración para ella. Resultado:
 * `SequelizeDatabaseError: column DialogChatBots.awaiting does not exist` en cada
 * mensaje que entra al flujo de chatbot → "Error handling whatsapp message" y el
 * bot no responde. (Detectado por la sonda de mensaje real del refactor Ola 4.)
 *
 * ⚠️ Aplicada QUIRÚRGICAMENTE por SQL directo:
 *      ALTER TABLE "DialogChatBots" ADD COLUMN IF NOT EXISTS "awaiting" INTEGER;
 *    NO con `npm run db:migrate` — el runner está DESINCRONIZADO (SequelizeMeta vs
 *    cientos de archivos en disco) e intentaría aplicar todo y romper la BD.
 *    Este archivo es para reproducibilidad/registro; su `up` es idempotente.
 */
module.exports = {
  up: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("DialogChatBots");
    if (!table.awaiting) {
      await queryInterface.addColumn("DialogChatBots", "awaiting", {
        type: DataTypes.INTEGER,
        allowNull: true
      });
    }
  },
  down: async (queryInterface: QueryInterface) => {
    const table: any = await queryInterface.describeTable("DialogChatBots");
    if (table.awaiting) {
      await queryInterface.removeColumn("DialogChatBots", "awaiting");
    }
  }
};
