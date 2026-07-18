/**
 * UpdateWhatsAppTemplateService
 * Actualiza una plantilla existente
 */

import WhatsAppTemplate, {
  TemplateCategory,
  HeaderType,
  TemplateButton,
  TemplateStatus
} from "../../models/WhatsAppTemplate";
import AppError from "../../errors/AppError";

interface Request {
  templateId: number;
  companyId: number;
  name?: string;
  category?: TemplateCategory;
  language?: string;
  headerType?: HeaderType;
  headerContent?: string;
  bodyContent?: string;
  footerContent?: string;
  buttons?: TemplateButton[];
  variableExamples?: string[];
  isActive?: boolean;
}

// Validar nombre del template
const validateTemplateName = (name: string): boolean => {
  const regex = /^[a-z0-9_]+$/;
  return regex.test(name) && name.length >= 1 && name.length <= 512;
};

// Contar variables
const countVariables = (content: string): number => {
  const matches = content.match(/\{\{\d+\}\}/g);
  return matches ? matches.length : 0;
};

const UpdateWhatsAppTemplateService = async ({
  templateId,
  companyId,
  name,
  category,
  language,
  headerType,
  headerContent,
  bodyContent,
  footerContent,
  buttons,
  variableExamples,
  isActive
}: Request): Promise<WhatsAppTemplate> => {
  // Buscar template
  const template = await WhatsAppTemplate.findOne({
    where: {
      id: templateId,
      companyId
    }
  });

  if (!template) {
    throw new AppError("ERR_TEMPLATE_NOT_FOUND", 404);
  }

  // Si el template ya está aprobado en Meta, no permitir cambios en contenido
  if (template.status === "APPROVED" && template.metaTemplateId) {
    // Solo permitir cambios en isActive
    if (isActive !== undefined) {
      await template.update({ isActive });
      return template;
    }
    throw new AppError(
      "ERR_TEMPLATE_APPROVED_CANNOT_MODIFY",
      400
    );
  }

  // Validar nombre si se proporciona
  if (name && !validateTemplateName(name)) {
    throw new AppError("ERR_TEMPLATE_INVALID_NAME", 400);
  }

  // Verificar duplicado si cambia el nombre
  if (name && name !== template.name) {
    const existingTemplate = await WhatsAppTemplate.findOne({
      where: {
        name,
        companyId,
        language: language || template.language
      }
    });

    if (existingTemplate && existingTemplate.id !== templateId) {
      throw new AppError("ERR_TEMPLATE_NAME_ALREADY_EXISTS", 400);
    }
  }

  // Validar footer
  if (footerContent && footerContent.length > 60) {
    throw new AppError("ERR_TEMPLATE_FOOTER_TOO_LONG", 400);
  }

  // Validar botones
  if (buttons && buttons.length > 3) {
    throw new AppError("ERR_TEMPLATE_TOO_MANY_BUTTONS", 400);
  }

  // Preparar datos de actualización
  const updateData: Partial<WhatsAppTemplate> = {};

  if (name !== undefined) updateData.name = name;
  if (category !== undefined) updateData.category = category;
  if (language !== undefined) updateData.language = language;
  if (headerType !== undefined) updateData.headerType = headerType;
  if (headerContent !== undefined) updateData.headerContent = headerContent;
  if (bodyContent !== undefined) updateData.bodyContent = bodyContent;
  if (footerContent !== undefined) updateData.footerContent = footerContent;
  if (buttons !== undefined) updateData.buttons = buttons;
  if (variableExamples !== undefined) updateData.variableExamples = variableExamples;
  if (isActive !== undefined) updateData.isActive = isActive;

  // Recalcular variables si cambia el contenido
  if (bodyContent || headerContent) {
    const newHeaderType = headerType || template.headerType;
    const newHeaderContent = headerContent !== undefined ? headerContent : template.headerContent;
    const newBodyContent = bodyContent || template.bodyContent;

    const headerVars = newHeaderType === "TEXT" ? countVariables(newHeaderContent || "") : 0;
    const bodyVars = countVariables(newBodyContent);
    updateData.variablesCount = headerVars + bodyVars;
  }

  // Si se modifica contenido, volver a estado PENDING
  if (bodyContent || headerContent || footerContent || buttons) {
    updateData.status = "PENDING" as TemplateStatus;
    updateData.metaTemplateId = undefined as any;
  }

  await template.update(updateData);

  return template;
};

export default UpdateWhatsAppTemplateService;
