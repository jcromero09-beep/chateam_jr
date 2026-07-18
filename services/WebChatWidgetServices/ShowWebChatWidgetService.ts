import WebChatWidget from "../../models/WebChatWidget";
import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";
import AppError from "../../errors/AppError";

interface Request {
  id: number;
  companyId: number;
}

const ShowWebChatWidgetService = async ({
  id,
  companyId
}: Request): Promise<WebChatWidget> => {
  const widget = await WebChatWidget.findOne({
    where: { id, companyId },
    include: [
      {
        model: Whatsapp,
        as: "whatsapp",
        attributes: ["id", "name", "status", "channel"]
      },
      {
        model: Queue,
        as: "queue",
        attributes: ["id", "name", "color"]
      }
    ]
  });

  if (!widget) {
    throw new AppError("ERR_WEBCHAT_WIDGET_NOT_FOUND", 404);
  }

  return widget;
};

export default ShowWebChatWidgetService;
