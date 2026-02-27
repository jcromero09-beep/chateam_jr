import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";

const DeleteTelegramService = async (id: string | number): Promise<void> => {
  const telegram = await Whatsapp.findOne({
    where: {
      id,
      channel: "telegram"
    }
  });

  if (!telegram) {
    throw new AppError("Bot Telegram no encontrado", 404);
  }

  await telegram.destroy();
};

export default DeleteTelegramService;
