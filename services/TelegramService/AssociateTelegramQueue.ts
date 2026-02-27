import Telegram from "../../models/Telegram";
import Queue from "../../models/Queue";

const AssociateTelegramQueue = async (
  telegram: Telegram,
  queueIds: number[]
): Promise<void> => {
  // Remover asociaciones antiguas
  await telegram.$set("queues", []);
  
  // Crear nuevas asociaciones
  if (queueIds && queueIds.length > 0) {
    await telegram.$add("queues", queueIds);
  }
};

export default AssociateTelegramQueue;
