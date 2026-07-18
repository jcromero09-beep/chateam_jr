/**
 * DeleteWhatsAppTemplateService
 * Elimina una plantilla de WhatsApp (soft delete o hard delete)
 */

import WhatsAppTemplate from "../../models/WhatsAppTemplate";
import AppError from "../../errors/AppError";

interface Request {
  templateId: number;
  companyId: number;
  hardDelete?: boolean; // Si true, elimina físicamente
}

const DeleteWhatsAppTemplateService = async ({
  templateId,
  companyId,
  hardDelete = false
}: Request): Promise<void> => {
  const template = await WhatsAppTemplate.findOne({
    where: {
      id: templateId,
      companyId
    }
  });

  if (!template) {
    throw new AppError("ERR_TEMPLATE_NOT_FOUND", 404);
  }

  // Si el template está en Meta y tiene metaTemplateId, hay que eliminarlo también de Meta
  if (template.metaTemplateId && template.status === "APPROVED") {
    // TODO: Implementar eliminación en Meta
    // const metaService = new MetaTemplateService();
    // await metaService.deleteTemplate(template.metaTemplateId, whatsappId);
  }

  if (hardDelete) {
    // Eliminación física
    await template.destroy();
  } else {
    // Soft delete - solo desactivar
    await template.update({ isActive: false });
  }
};

export default DeleteWhatsAppTemplateService;
