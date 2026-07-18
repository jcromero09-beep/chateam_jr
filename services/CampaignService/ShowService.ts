import { Op } from "sequelize";
import Campaign from "../../models/Campaign";
import AppError from "../../errors/AppError";
import CampaignShipping from "../../models/CampaignShipping";
import ContactList from "../../models/ContactList";
import ContactListItem from "../../models/ContactListItem";
import Whatsapp from "../../models/Whatsapp";
import User from "../../models/User";
import Queue from "../../models/Queue";
import WhatsAppTemplate from "../../models/WhatsAppTemplate";
import logger from "../../utils/logger";

interface ShowServiceResult {
  [key: string]: any;
  totalRecipients: number;
  successCount: number;
  errorCount: number;
  pendingCount: number;
  metaCost: null;
}

const ShowService = async (
  id: string | number,
  companyId?: string | number
): Promise<ShowServiceResult> => {
  const where: any = { id };
  if (companyId !== undefined) {
    where.companyId = companyId;
  }

  const record = await Campaign.findOne({
    where,
    include: [
      { model: CampaignShipping },
      { model: ContactList, include: [{ model: ContactListItem }] },
      { model: Whatsapp, attributes: ["id", "name", "channel", "phoneNumberId"] },
      { model: User, attributes: ["id", "name"] },
      { model: Queue, attributes: ["id", "name"] },
      {
        model: WhatsAppTemplate,
        as: "whastsAppTemplate",
        attributes: [
          "id",
          "name",
          "status",
          "category",
          "language",
          "bodyContent",
          "headerType",
          "headerContent",
          "footerContent",
          "variablesCount"
        ]
      }
    ]
  });

  if (!record) {
    throw new AppError("ERR_NO_CAMPAIGN_FOUND", 404);
  }

  // Agregados "Revisar"
  const totalRecipients = record.contactListId
    ? await ContactListItem.count({
        where: {
          contactListId: record.contactListId,
          isWhatsappValid: true
        }
      })
    : 0;

  const successCount = await CampaignShipping.count({
    where: {
      campaignId: record.id,
      deliveredAt: { [Op.not]: null }
    }
  });

  // IMPORTANTE: failedAt es columna nueva que Agente 3 agregará vía migración
  // a CampaignShipping. Envuelto en try/catch para no romper integración
  // mientras la migración no esté ejecutada.
  let errorCount = 0;
  try {
    errorCount = await CampaignShipping.count({
      where: {
        campaignId: record.id,
        failedAt: { [Op.not]: null }
      } as any
    });
  } catch (err: any) {
    logger.warn(
      { err: err?.message, campaignId: record.id },
      "[CampaignShow] failedAt aún no disponible en CampaignShipping; errorCount=0"
    );
    errorCount = 0;
  }

  const pendingCount = Math.max(0, totalRecipients - successCount - errorCount);

  return {
    ...record.toJSON(),
    totalRecipients,
    successCount,
    errorCount,
    pendingCount,
    metaCost: null // punto de extensión - no inventado
  };
};

export default ShowService;
