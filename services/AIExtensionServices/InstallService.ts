import * as Yup from "yup";
import AIExtension from "../../models/AIExtension";
import AICompanyExtension from "../../models/AICompanyExtension";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface Request {
  companyId: number;
  extensionId: number;
  configOverride?: Record<string, unknown>;
}

const InstallService = async ({
  companyId,
  extensionId,
  configOverride = {}
}: Request): Promise<AICompanyExtension> => {
  const schema = Yup.object().shape({
    companyId: Yup.number().required().positive(),
    extensionId: Yup.number().required("El extensionId es obligatorio").positive()
  });

  try {
    await schema.validate({ companyId, extensionId }, { abortEarly: false });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  // Verificar que la extensión existe y está activa
  const extension = await AIExtension.findOne({
    where: { id: extensionId, isActive: true }
  });

  if (!extension) {
    throw new AppError("ERR_AI_EXTENSION_NOT_FOUND", 404);
  }

  // Verificar si ya está instalada
  let companyExtension = await AICompanyExtension.findOne({
    where: { companyId, extensionId }
  });

  if (companyExtension && companyExtension.installed) {
    throw new AppError("ERR_AI_EXTENSION_ALREADY_INSTALLED", 409);
  }

  if (companyExtension) {
    // Reinstalar extensión previamente desinstalada
    await companyExtension.update({
      installed: true,
      configOverride,
      installedAt: new Date()
    });
  } else {
    // Nueva instalación
    companyExtension = await AICompanyExtension.create({
      companyId,
      extensionId,
      installed: true,
      configOverride,
      installedAt: new Date()
    } as any);
  }

  await companyExtension.reload({
    include: [{ model: AIExtension, as: "extension" }]
  });

  logger.info(
    `[AIExtensionService] Extensión instalada: company=${companyId}, extension=${extensionId}, slug=${extension.slug}`
  );

  return companyExtension;
};

export default InstallService;
