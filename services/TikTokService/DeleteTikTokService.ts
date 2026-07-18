import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";

const DeleteTikTokService = async (id: string | number): Promise<void> => {
  const tiktok = await Whatsapp.findOne({
    where: {
      id,
      channel: "tiktok"
    }
  });

  if (!tiktok) {
    throw new AppError("Conexión TikTok no encontrada", 404);
  }

  await tiktok.destroy();
};

export default DeleteTikTokService;
