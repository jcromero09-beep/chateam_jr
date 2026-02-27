import WebChatWidget from "../../models/WebChatWidget";
import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";

interface Request {
  companyId: number;
}

const ListWebChatWidgetsService = async ({
  companyId
}: Request): Promise<WebChatWidget[]> => {
  const widgets = await WebChatWidget.findAll({
    where: { companyId },
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
    ],
    order: [["createdAt", "DESC"]]
  });

  return widgets;
};

export default ListWebChatWidgetsService;
