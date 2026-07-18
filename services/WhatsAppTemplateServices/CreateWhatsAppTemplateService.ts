/**
 * CreateWhatsAppTemplateService
 * Crea una nueva plantilla de WhatsApp y opcionalmente la envía a Meta para aprobación
 *
 * Soporta:
 * - Parámetros posicionales: {{1}}, {{2}}, etc.
 * - Parámetros con nombre: {{first_name}}, {{order_number}}, etc.
 */

import WhatsAppTemplate, {
  TemplateCategory,
  HeaderType,
  TemplateButton,
  TemplateButtonInput,
  TemplateComponent,
  ParameterFormat,
  NamedParam,
  generateButtonId
} from "../../models/WhatsAppTemplate";
import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";
import SubmitTemplateToMetaService from "./SubmitTemplateToMetaService";

interface Request {
  name: string;
  category: TemplateCategory;
  language: string;
  parameterFormat?: ParameterFormat;
  headerType?: HeaderType;
  headerContent?: string;
  bodyContent: string;
  footerContent?: string;
  buttons?: TemplateButtonInput[];       // Entrada del usuario (sin ID)
  variableExamples?: string[];           // Para formato posicional
  namedVariableExamples?: NamedParam[];  // Para formato con nombre
  companyId: number;
  whatsappId?: number;
  submitToMeta?: boolean;
}

interface Response {
  template: WhatsAppTemplate;
  metaResponse?: any;
}

// Validar nombre del template (solo minúsculas, números y guiones bajos)
const validateTemplateName = (name: string): boolean => {
  const regex = /^[a-z0-9_]+$/;
  return regex.test(name) && name.length >= 1 && name.length <= 512;
};

// Contar variables en el contenido
// Soporta formato posicional {{1}} y con nombre {{nombre}}
const countVariables = (content: string): number => {
  const matches = content.match(/\{\{[^}]+\}\}/g);
  return matches ? matches.length : 0;
};

// Extraer nombres de variables del contenido (para formato con nombre)
const extractVariableNames = (content: string): string[] => {
  const matches = content.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return [];
  return matches.map(m => m.replace(/\{\{|\}\}/g, "").trim());
};

// Detectar automáticamente el formato de parámetros
const detectParameterFormat = (content: string): ParameterFormat => {
  // Si contiene {{1}}, {{2}}, etc. es posicional
  if (/\{\{\d+\}\}/.test(content)) {
    return "positional";
  }
  // Si contiene {{nombre}}, {{algo}} es con nombre
  if (/\{\{[a-z_][a-z0-9_]*\}\}/i.test(content)) {
    return "named";
  }
  return "positional"; // Default
};

// Generar IDs automáticos para botones
const generateButtonIds = (buttons?: TemplateButtonInput[]): TemplateButton[] | undefined => {
  if (!buttons || buttons.length === 0) return undefined;

  return buttons.map((btn, index) => ({
    id: generateButtonId(index),
    index,
    type: btn.type,
    text: btn.text,
    url: btn.url,
    phoneNumber: btn.phoneNumber,
    example: btn.example
  }));
};

// Construir componentes para la API de Meta
const buildMetaComponents = (
  headerType: HeaderType,
  headerContent: string | undefined,
  bodyContent: string,
  footerContent: string | undefined,
  buttons: TemplateButton[] | undefined,
  variableExamples: string[] | undefined,
  namedVariableExamples: NamedParam[] | undefined,
  parameterFormat: ParameterFormat
): TemplateComponent[] => {
  const components: TemplateComponent[] = [];
  const isNamedFormat = parameterFormat === "named";

  // Header
  if (headerType !== "NONE" && headerContent) {
    const headerComponent: TemplateComponent = {
      type: "HEADER",
      format: headerType
    };

    if (headerType === "TEXT") {
      headerComponent.text = headerContent;
      const headerVars = countVariables(headerContent);
      if (headerVars > 0) {
        if (isNamedFormat && namedVariableExamples) {
          // Para header con nombre, extraer los params relevantes
          const headerVarNames = extractVariableNames(headerContent);
          headerComponent.example = {
            header_text: namedVariableExamples
              .filter(p => headerVarNames.includes(p.param_name))
              .map(p => p.example)
          };
        } else if (variableExamples) {
          headerComponent.example = {
            header_text: variableExamples.slice(0, headerVars)
          };
        }
      }
    } else {
      // Para IMAGE, VIDEO, DOCUMENT - se necesita el handle del media
      headerComponent.example = {
        header_handle: [headerContent]
      };
    }

    components.push(headerComponent);
  }

  // Body (obligatorio)
  const bodyComponent: TemplateComponent = {
    type: "BODY",
    text: bodyContent
  };

  const bodyVars = countVariables(bodyContent);
  if (bodyVars > 0) {
    if (isNamedFormat && namedVariableExamples) {
      // Formato con nombre
      const bodyVarNames = extractVariableNames(bodyContent);
      bodyComponent.example = {
        body_text_named_params: namedVariableExamples.filter(p =>
          bodyVarNames.includes(p.param_name)
        )
      };
    } else if (variableExamples) {
      // Formato posicional
      const startIdx = headerType === "TEXT" ? countVariables(headerContent || "") : 0;
      bodyComponent.example = {
        body_text: [variableExamples.slice(startIdx, startIdx + bodyVars)]
      };
    }
  }

  components.push(bodyComponent);

  // Footer (máximo 60 caracteres, sin variables)
  if (footerContent) {
    components.push({
      type: "FOOTER",
      text: footerContent.substring(0, 60)
    });
  }

  // Buttons
  if (buttons && buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: buttons
    });
  }

  return components;
};

const CreateWhatsAppTemplateService = async ({
  name,
  category,
  language,
  parameterFormat,
  headerType = "NONE",
  headerContent,
  bodyContent,
  footerContent,
  buttons,
  variableExamples,
  namedVariableExamples,
  companyId,
  whatsappId,
  submitToMeta = false
}: Request): Promise<Response> => {
  // Validar nombre
  if (!validateTemplateName(name)) {
    throw new AppError(
      "ERR_TEMPLATE_INVALID_NAME: El nombre solo puede contener minúsculas, números y guiones bajos (máx 512 caracteres)",
      400
    );
  }

  // Validar que el body no esté vacío
  if (!bodyContent || bodyContent.trim().length === 0) {
    throw new AppError("ERR_TEMPLATE_BODY_REQUIRED", 400);
  }

  // Validar footer (máx 60 caracteres)
  if (footerContent && footerContent.length > 60) {
    throw new AppError("ERR_TEMPLATE_FOOTER_TOO_LONG: El footer no puede exceder 60 caracteres", 400);
  }

  // Validar botones según reglas de Meta
  if (buttons && buttons.length > 0) {
    const quickReplyCount = buttons.filter(b => b.type === 'QUICK_REPLY').length;
    const urlCount = buttons.filter(b => b.type === 'URL').length;
    const phoneCount = buttons.filter(b => b.type === 'PHONE_NUMBER').length;
    const copyCodeCount = buttons.filter(b => b.type === 'COPY_CODE').length;
    const callToActionCount = urlCount + phoneCount;

    // Regla: No mezclar QUICK_REPLY con CALL_TO_ACTION (URL, PHONE_NUMBER)
    if (quickReplyCount > 0 && callToActionCount > 0) {
      throw new AppError("ERR_TEMPLATE_BUTTONS_MIXED: No puedes mezclar botones de respuesta rápida con enlaces o teléfonos. Usa solo un tipo.", 400);
    }

    // Máximo 3 QUICK_REPLY
    if (quickReplyCount > 3) {
      throw new AppError("ERR_TEMPLATE_TOO_MANY_QUICK_REPLY: Máximo 3 botones de respuesta rápida permitidos", 400);
    }

    // Máximo 2 CALL_TO_ACTION (1 URL + 1 Teléfono)
    if (callToActionCount > 2) {
      throw new AppError("ERR_TEMPLATE_TOO_MANY_CALL_TO_ACTION: Máximo 2 botones de acción permitidos (1 URL + 1 Teléfono)", 400);
    }

    // COPY_CODE solo para AUTHENTICATION
    if (copyCodeCount > 0 && category !== 'AUTHENTICATION') {
      throw new AppError("ERR_TEMPLATE_COPY_CODE_WRONG_CATEGORY: Los botones de copiar código solo se permiten en plantillas de autenticación", 400);
    }

    // URL debe tener código de país completo si es teléfono
    buttons.forEach(btn => {
      if (btn.type === 'PHONE_NUMBER' && btn.phoneNumber) {
        if (!/^\+\d{10,15}$/.test(btn.phoneNumber)) {
          throw new AppError("ERR_TEMPLATE_PHONE_FORMAT: El número de teléfono debe incluir código de país (ej: +593999999999)", 400);
        }
      }
      if (btn.type === 'URL' && btn.url) {
        if (!btn.url.startsWith('http://') && !btn.url.startsWith('https://')) {
          throw new AppError("ERR_TEMPLATE_URL_FORMAT: La URL debe comenzar con http:// o https://", 400);
        }
      }
    });
  }

  // Verificar que no exista un template con el mismo nombre para esta company
  const existingTemplate = await WhatsAppTemplate.findOne({
    where: {
      name,
      companyId,
      language
    }
  });

  if (existingTemplate) {
    throw new AppError("ERR_TEMPLATE_NAME_ALREADY_EXISTS: Ya existe una plantilla con este nombre e idioma", 400);
  }

  // Si se especifica whatsappId, verificar que exista y sea channel meta
  if (whatsappId) {
    const whatsapp = await Whatsapp.findOne({
      where: {
        id: whatsappId,
        companyId,
        channel: "meta"
      }
    });

    if (!whatsapp) {
      throw new AppError("ERR_WHATSAPP_NOT_FOUND_OR_NOT_META", 404);
    }
  }

  // Detectar o usar el formato de parámetros especificado
  const allContent = `${headerContent || ""} ${bodyContent}`;
  const detectedFormat = parameterFormat || detectParameterFormat(allContent);

  // Contar variables totales
  const headerVars = headerType === "TEXT" ? countVariables(headerContent || "") : 0;
  const bodyVars = countVariables(bodyContent);
  const totalVariables = headerVars + bodyVars;

  // Validar que se provean ejemplos si hay variables
  if (totalVariables > 0) {
    if (detectedFormat === "named") {
      if (!namedVariableExamples || namedVariableExamples.length < totalVariables) {
        throw new AppError(
          `ERR_TEMPLATE_MISSING_VARIABLE_EXAMPLES: Se requieren ${totalVariables} ejemplos con nombre`,
          400
        );
      }
    } else {
      if (!variableExamples || variableExamples.length < totalVariables) {
        throw new AppError(
          `ERR_TEMPLATE_MISSING_VARIABLE_EXAMPLES: Se requieren ${totalVariables} ejemplos posicionales`,
          400
        );
      }
    }
  }

  // Generar IDs automáticos para botones
  const buttonsWithIds = generateButtonIds(buttons);

  // Construir componentes para Meta
  const components = buildMetaComponents(
    headerType,
    headerContent,
    bodyContent,
    footerContent,
    buttonsWithIds,
    variableExamples,
    namedVariableExamples,
    detectedFormat
  );

  // Crear template en base de datos
  const template = await WhatsAppTemplate.create({
    name,
    category,
    language,
    parameterFormat: detectedFormat,
    status: "PENDING",
    headerType,
    headerContent,
    bodyContent,
    footerContent,
    buttons: buttonsWithIds,
    variablesCount: totalVariables,
    variableExamples,
    namedVariableExamples,
    components,
    companyId,
    whatsappId,
    isActive: true,
    usageCount: 0
  });

  let metaResponse: any = null;

  // Si submitToMeta es true, enviar a Meta para aprobación
  if (submitToMeta && whatsappId) {
    try {
      metaResponse = await SubmitTemplateToMetaService({
        templateId: template.id,
        companyId,
        whatsappId
      });
    } catch (error: any) {
      // Si falla el envío a Meta, mantener el template local pero reportar error
      console.error("[CreateTemplate] Error enviando a Meta:", error.message);
      await template.update({
        status: "PENDING",
        rejectedReason: `Error al enviar: ${error.message}`
      });
    }
  }

  return {
    template,
    metaResponse
  };
};

export default CreateWhatsAppTemplateService;
