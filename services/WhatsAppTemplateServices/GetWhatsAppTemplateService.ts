/**
 * GetWhatsAppTemplateService
 * Obtiene una plantilla específica por ID
 */

import WhatsAppTemplate from "../../models/WhatsAppTemplate";
import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";

interface Request {
  templateId: number;
  companyId: number;
}

const GetWhatsAppTemplateService = async ({
  templateId,
  companyId
}: Request): Promise<WhatsAppTemplate> => {
  const template = await WhatsAppTemplate.findOne({
    where: {
      id: templateId,
      companyId
    },
    include: [
      {
        model: Whatsapp,
        as: "whatsapp",
        attributes: ["id", "name", "number", "status", "channel"],
        required: false
      }
    ]
  });

  if (!template) {
    throw new AppError("ERR_TEMPLATE_NOT_FOUND", 404);
  }

  return template;
};

export default GetWhatsAppTemplateService;
