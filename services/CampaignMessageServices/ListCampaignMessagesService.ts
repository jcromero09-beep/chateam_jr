import { Op } from "sequelize";
import CampaignMessage from "../../models/CampaignMessage";
import FacebookConversionEvent from "../../models/FacebookConversionEvent";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";

interface Request {
  companyId: number;
  searchParam?: string;
  pageNumber?: string | number;
  channel?: string;
  conversionStatus?: "all" | "sent" | "pending" | "pending_no_value";
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
  channel,
  conversionStatus = "all"
}: Request): Promise<Response> => {
  const limit = 20;
  const offset = limit * (Number(pageNumber) - 1);

  // Condiciones AND (usar Op.and evita que el Op.or de búsqueda choque con el Op.or del filtro "sin valor").
  const andConditions: any[] = [];

  if (searchParam) {
    andConditions.push({
      [Op.or]: [
        { headline: { [Op.iLike]: `%${searchParam}%` } },
        { body: { [Op.iLike]: `%${searchParam}%` } },
        { sourceId: { [Op.iLike]: `%${searchParam}%` } },
        { ctwaClid: { [Op.iLike]: `%${searchParam}%` } },
        { conversionNote: { [Op.iLike]: `%${searchParam}%` } },
        // También por CONTACTO (nombre y número). subQuery:false hace que el filtro por la
        // asociación funcione junto con el limit.
        { "$contact.name$": { [Op.iLike]: `%${searchParam}%` } },
        { "$contact.number$": { [Op.iLike]: `%${searchParam}%` } }
      ]
    });
  }

  // Filtro por ESTADO de conversión. El estado 'enviada' vive en FacebookConversionEvent
  // (Purchase con responseStatus 'sent'/'success'). "Pendiente" = contacto sin conversión enviada.
  //   - "pending"          → pendientes CON valor (la nota tiene un monto > 0, listas para enviar)
  //   - "pending_no_value" → pendientes SIN valor (falta asignar el monto)
  if (conversionStatus !== "all") {
    const sentEvents = await FacebookConversionEvent.findAll({
      where: {
        companyId,
        eventName: "Purchase",
        responseStatus: { [Op.in]: ["sent", "success"] }
      },
      attributes: ["contactId"],
      group: ["contactId"]
    });
    const sentContactIds = sentEvents
      .map((e: any) => Number(e.contactId))
      .filter((id: number) => Number.isFinite(id) && id > 0);

    if (conversionStatus === "sent") {
      andConditions.push({ contactId: sentContactIds.length ? { [Op.in]: sentContactIds } : { [Op.in]: [-1] } });
    } else {
      // pending / pending_no_value → contacto SIN conversión enviada
      if (sentContactIds.length) {
        andConditions.push({ contactId: { [Op.notIn]: sentContactIds } });
      }
      // "Con valor" ≈ la nota contiene un dígito 1-9 (aprox de monto > 0, ej "$100", "50").
      if (conversionStatus === "pending") {
        andConditions.push({ conversionNote: { [Op.regexp]: "[1-9]" } });
      } else if (conversionStatus === "pending_no_value") {
        andConditions.push({
          [Op.or]: [
            { conversionNote: null as any },
            { conversionNote: "" },
            { conversionNote: { [Op.notRegexp]: "[1-9]" } }
          ]
        });
      }
    }
  }

  const whereCondition: any = { companyId };
  if (channel) {
    whereCondition.channel = channel;
  }
  if (andConditions.length) {
    whereCondition[Op.and] = andConditions;
  }

  const { count, rows: campaignMessages } = await CampaignMessage.findAndCountAll({
    where: whereCondition,
    include: [
      { model: Contact, as: "contact", attributes: ["id", "name", "number", "profilePicUrl"] },
      { model: Message, as: "message", attributes: ["id", "body", "createdAt"] },
      { model: Ticket, as: "ticket", attributes: ["id", "status"] },
      { model: Whatsapp, as: "whatsapp", attributes: ["id", "name"] }
    ],
    // subQuery:false → el filtro por $contact.name$/$contact.number$ (asociación) se resuelve
    // en el JOIN de la query principal junto con el limit. Contact es belongsTo (1:1) → el count
    // no se duplica. order/limit siguen aplicando sobre CampaignMessage.
    subQuery: false,
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
