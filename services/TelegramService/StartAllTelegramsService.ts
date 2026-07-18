import Whatsapp from "../../models/Whatsapp";
import StartTelegramSession from "./StartTelegramSession";
import logger from "../../utils/logger";

const StartAllTelegramsService = async (): Promise<void> => {
  try {
    logger.info("🚀 Iniciando todas las sesiones Telegram...");

    const telegrams = await Whatsapp.findAll({
      where: {
        status: ["CONNECTED", "OPENING", "PAIRING"],
        channel: "telegram"
      }
    });

    if (telegrams.length === 0) {
      logger.info("📱 No se encontraron bots Telegram para iniciar");
      return;
    }

    logger.info(`📱 Encontrados ${telegrams.length} bots Telegram para iniciar`);

    // Iniciar todas las sesiones en paralelo
    const startPromises = telegrams.map(async (telegram) => {
      try {
        await StartTelegramSession(telegram, telegram.companyId);
        logger.info(`✅ Bot Telegram iniciado: ${telegram.name} (ID: ${telegram.id})`);
      } catch (error: any) {
        logger.error({ error: error.message, botName: telegram.name }, `❌ Error al iniciar bot Telegram`);

        // Actualizar status para DISCONNECTED en caso de error
        await telegram.update({
          status: "DISCONNECTED"
        });
      }
    });

    await Promise.all(startPromises);

    logger.info("✅ Proceso de inicialización de bots Telegram concluido");

  } catch (error: any) {
    logger.error({ error: error.message }, "❌ Error general al iniciar bots Telegram");
  }
};

export default StartAllTelegramsService;
