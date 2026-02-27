import Chat from "../../models/Chat";
import AppError from "../../errors/AppError";
import { cleanupDeletedChatFiles } from "./FileCleanupService";

const DeleteService = async (id: string): Promise<void> => {
  const record = await Chat.findOne({
    where: { id }
  });

  if (!record) {
    throw new AppError("ERR_NO_CHAT_FOUND", 404);
  }

  const chatId = record.id;
  const companyId = record.companyId;

  // Eliminar el chat de la base de datos
  await record.destroy();

  // Limpiar archivos asociados al chat eliminado
  try {
    await cleanupDeletedChatFiles(companyId, chatId);
    console.log(`Files cleaned up for deleted chat ${chatId}`);
  } catch (error) {
    console.error(`Error cleaning up files for chat ${chatId}:`, error);
    // No lanzamos error aquí para no fallar la eliminación del chat
  }
};

export default DeleteService;
