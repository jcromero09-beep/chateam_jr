import { Op } from "sequelize";
import AIEmailTemplate from "../../models/AIEmailTemplate";
import AppError from "../../errors/AppError";

interface Request {
  companyId: number;
  slug: string;
  variables: Record<string, string>;
}

interface Response {
  subject: string;
  body: string;
  templateId: number;
}

const RenderService = async ({
  companyId,
  slug,
  variables = {}
}: Request): Promise<Response> => {
  // Buscar template: primero custom de la company, luego sistema
  let template = await AIEmailTemplate.findOne({
    where: {
      slug,
      companyId,
      isActive: true
    }
  });

  // Si no hay template custom, buscar el de sistema
  if (!template) {
    template = await AIEmailTemplate.findOne({
      where: {
        slug,
        companyId: { [Op.is]: null as any },
        isActive: true
      }
    });
  }

  if (!template) {
    throw new AppError("ERR_AI_EMAIL_TEMPLATE_NOT_FOUND", 404);
  }

  // Reemplazar variables en subject y body
  let renderedSubject = template.subject;
  let renderedBody = template.body;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    renderedSubject = renderedSubject.split(placeholder).join(value);
    renderedBody = renderedBody.split(placeholder).join(value);
  }

  return {
    subject: renderedSubject,
    body: renderedBody,
    templateId: template.id
  };
};

export default RenderService;
