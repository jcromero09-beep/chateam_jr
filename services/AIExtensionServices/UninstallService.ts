import AIExtension from "../../models/AIExtension";
import AICompanyExtension from "../../models/AICompanyExtension";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

interface Request {
  companyId: number;
  extensionId: number;
}

const UninstallService = async ({
  companyId,
  extensionId
}: Request): Promise<void> => {
  // Verificar que la extensión existe
  const extension = await AIExtension.findByPk(extensionId);

  if (!extension) {
    throw new AppError("ERR_AI_EXTENSION_NOT_FOUND", 404);
  }

  // No permitir desinstalar extensiones core
  if (extension.isCore) {
    throw new AppError("ERR_AI_EXTENSION_IS_CORE", 400);
  }

  const companyExtension = await AICompanyExtension.findOne({
    where: { companyId, extensionId, installed: true }
  });

  if (!companyExtension) {
    throw new AppError("ERR_AI_EXTENSION_NOT_INSTALLED", 404);
  }

  await companyExtension.update({
    installed: false
  });

  logger.info(
    `[AIExtensionService] Extensión desinstalada: company=${companyId}, extension=${extensionId}, slug=${extension.slug}`
  );
};

export default UninstallService;
