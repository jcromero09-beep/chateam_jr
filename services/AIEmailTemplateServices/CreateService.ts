import * as Yup from "yup";
import AIEmailTemplate from "../../models/AIEmailTemplate";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface Request {
  companyId: number;
  type?: string;
  slug: string;
  subject: string;
  body: string;
  variables?: string[];
}

const CreateService = async ({
  companyId,
  type = "custom",
  slug,
  subject,
  body,
  variables = []
}: Request): Promise<AIEmailTemplate> => {
  const schema = Yup.object().shape({
    companyId: Yup.number().required().positive(),
    slug: Yup.string().required("El slug es obligatorio").max(100),
    subject: Yup.string().required("El subject es obligatorio").max(500),
    body: Yup.string().required("El body es obligatorio"),
    type: Yup.string().oneOf(["system", "custom", "ai_generated"], "Tipo no válido")
  });

  try {
    await schema.validate({ companyId, slug, subject, body, type }, { abortEarly: false });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  // Verificar slug duplicado para la misma company
  const existing = await AIEmailTemplate.findOne({
    where: { companyId, slug }
  });

  if (existing) {
    throw new AppError("ERR_AI_EMAIL_TEMPLATE_DUPLICATE_SLUG", 409);
  }

  const template = await AIEmailTemplate.create({
    companyId,
    type,
    slug,
    subject,
    body,
    variables
  } as any);

  await template.reload();

  logger.info(
    `[AIEmailTemplateService] Template creado: company=${companyId}, slug=${slug}, type=${type}`
  );

  return template;
};

export default CreateService;
