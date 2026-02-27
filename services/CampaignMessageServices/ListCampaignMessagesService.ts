import { Op } from "sequelize";
import CampaignMessage from "../../models/CampaignMessage";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";

interface Request {
  companyId: number;
  searchParam?: string;
  pageNumber?: string | number;
  channel?: string;
}

interface Response {
  campaignMessages: CampaignMessage[];
  count: number;
  hasMore: boolean;
}

const ListCampaignMessagesService = async ({
  companyId,
  searchParam = "",
  pageNumber = "1",
  channel
}: Request): Promise<Response> => {
  const limit = 20;
  const offset = limit * (Number(pageNumber) - 1);

  const whereCondition: any = {
    companyId
  };

  if (searchParam) {
    whereCondition[Op.or] = [
      { headline: { [Op.iLike]: `%${searchParam}%` } },
      { body: { [Op.iLike]: `%${searchParam}%` } },
      { sourceId: { [Op.iLike]: `%${searchParam}%` } },
      { ctwaClid: { [Op.iLike]: `%${searchParam}%` } },
      { conversionNote: { [Op.iLike]: `%${searchParam}%` } }
    ];
  }

  if (channel) {
    whereCondition.channel = channel;
  }

  const { count, rows: campaignMessages } = await CampaignMessage.findAndCountAll({
    where: whereCondition,
    include: [
      { model: Contact, as: "contact", attributes: ["id", "name", "number", "profilePicUrl"] },
      { model: Message, as: "message", attributes: ["id", "body", "createdAt"] },
      { model: Ticket, as: "ticket", attributes: ["id", "status"] },
      { model: Whatsapp, as: "whatsapp", attributes: ["id", "name"] }
    ],
    limit,
    offset,
    order: [["createdAt", "DESC"]]
  });

  const hasMore = count > offset + campaignMessages.length;

  return {
    campaignMessages,
    count,
    hasMore
  };
};

export default ListCampaignMessagesService;
