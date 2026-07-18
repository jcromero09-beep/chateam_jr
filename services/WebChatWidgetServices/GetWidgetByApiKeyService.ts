import WebChatWidget from "../../models/WebChatWidget";
import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";
import AppError from "../../errors/AppError";

interface Request {
  apiKey: string;
}

const GetWidgetByApiKeyService = async ({
  apiKey
}: Request): Promise<WebChatWidget> => {
  const widget = await WebChatWidget.findOne({
    where: { apiKey, status: true },
    include: [
      {
        model: Whatsapp,
        as: "whatsapp",
        attributes: ["id", "name", "status", "channel"],
        required: false
      },
      {
        model: Queue,
        as: "queue",
        attributes: ["id", "name", "color"],
        required: false
      }
    ]
  });

  if (!widget) {
    throw new AppError("ERR_WEBCHAT_WIDGET_NOT_FOUND_OR_INACTIVE", 404);
  }

  return widget;
};

export default GetWidgetByApiKeyService;
