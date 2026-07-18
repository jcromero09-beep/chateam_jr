/**
 * ListWhatsAppTemplatesService
 * Lista plantillas de WhatsApp filtradas por companyId y otros criterios
 */

import { Op } from "sequelize";
import WhatsAppTemplate, {
  TemplateCategory,
  TemplateStatus
} from "../../models/WhatsAppTemplate";
import Whatsapp from "../../models/Whatsapp";

interface Request {
  companyId: number;
  category?: TemplateCategory;
  status?: TemplateStatus;
  language?: string;
  whatsappId?: number;
  searchTerm?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

interface Response {
  templates: WhatsAppTemplate[];
  count: number;
  hasMore: boolean;
}

const ListWhatsAppTemplatesService = async ({
  companyId,
  category,
  status,
  language,
  whatsappId,
  searchTerm,
  isActive = true,
  page = 1,
  limit = 50
}: Request): Promise<Response> => {
  const offset = (page - 1) * limit;

  // Construir where clause
  const whereClause: any = {
    companyId,
    isActive
  };

  if (category) {
    whereClause.category = category;
  }

  if (status) {
    whereClause.status = status;
  }

  if (language) {
    whereClause.language = language;
  }

  if (whatsappId) {
    whereClause.whatsappId = whatsappId;
  }

  if (searchTerm) {
    whereClause[Op.or] = [
      { name: { [Op.iLike]: `%${searchTerm}%` } },
      { bodyContent: { [Op.iLike]: `%${searchTerm}%` } }
    ];
  }

  const { rows: templates, count } = await WhatsAppTemplate.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: Whatsapp,
        as: "whatsapp",
        attributes: ["id", "name", "number", "status"],
        required: false
      }
    ],
    order: [
      ["status", "ASC"], // APPROVED primero
      ["usageCount", "DESC"],
      ["createdAt", "DESC"]
    ],
    limit,
    offset
  });

  return {
    templates,
    count,
    hasMore: offset + templates.length < count
  };
};

export default ListWhatsAppTemplatesService;
