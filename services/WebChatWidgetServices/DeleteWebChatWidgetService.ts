import WebChatWidget from "../../models/WebChatWidget";
import AppError from "../../errors/AppError";

interface Request {
  id: number;
  companyId: number;
}

const DeleteWebChatWidgetService = async ({
  id,
  companyId
}: Request): Promise<void> => {
  const widget = await WebChatWidget.findOne({
    where: { id, companyId }
  });

  if (!widget) {
    throw new AppError("ERR_WEBCHAT_WIDGET_NOT_FOUND", 404);
  }

  await widget.destroy();
};

export default DeleteWebChatWidgetService;
