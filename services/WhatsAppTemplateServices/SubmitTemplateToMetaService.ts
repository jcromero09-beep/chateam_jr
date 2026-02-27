/**
 * SubmitTemplateToMetaService
 * Envía una plantilla a Meta para aprobación
 *
 * Documentación: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates
 *
 * Soporta:
 * - Parámetros posicionales: {{1}}, {{2}}, etc.
 * - Parámetros con nombre: {{first_name}}, {{order_number}}, etc.
 */

import axios from "axios";
import WhatsAppTemplate, {
  TemplateComponent
} from "../../models/WhatsAppTemplate";
import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";

interface Request {
  templateId: number;
  companyId: number;
  whatsappId: number;
}

interface MetaTemplateResponse {
  id: string;
  status: string;
  category: string;
}

interface MetaTemplatePayload {
  name: string;
  language: string;
  category: string;
  parameter_format?: "named" | "positional";
  components: TemplateComponent[];
}

const GRAPH_API_VERSION = "v24.0";
const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const SubmitTemplateToMetaService = async ({
  templateId,
  companyId,
  whatsappId
}: Request): Promise<MetaTemplateResponse> => {
  // Obtener template
  const template = await WhatsAppTemplate.findOne({
    where: {
      id: templateId,
      companyId
    }
  });

  if (!template) {
    throw new AppError("ERR_TEMPLATE_NOT_FOUND", 404);
  }

  if (template.status === "APPROVED") {
    throw new AppError("ERR_TEMPLATE_ALREADY_APPROVED", 400);
  }

  // Obtener conexión de WhatsApp con token
  const whatsapp = await Whatsapp.findOne({
    where: {
      id: whatsappId,
      companyId,
      channel: "meta"
    }
  });

  if (!whatsapp) {
    throw new AppError("No se encontró la conexión META seleccionada. Verifica que sea una conexión de tipo 'meta'.", 404);
  }

  if (!whatsapp.tokenMeta) {
    throw new AppError("La conexión META no tiene Access Token configurado. Edita la conexión y agrega el token de Meta.", 400);
  }

  // Obtener WABA ID (Business Account ID) del facebookUserId o token
  const wabaId = whatsapp.facebookUserId;
  if (!wabaId) {
    throw new AppError("La conexión META no tiene WABA ID configurado. Edita la conexión y agrega el WABA ID (asset_id de WhatsApp Manager).", 400);
  }

  // Construir payload para Meta API
  // SIEMPRE reconstruir components desde los campos actuales (bodyContent, headerContent, etc.)
  // para asegurar que se use el contenido más reciente
  const payload: MetaTemplatePayload = {
    name: template.name,
    language: template.language,
    category: template.category,
    components: buildComponents(template)
  };

  // Agregar parameter_format si hay variables
  if (template.variablesCount > 0) {
    payload.parameter_format = template.parameterFormat || "positional";
  }

  console.log("[SubmitTemplate] Enviando a Meta:", JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post<MetaTemplateResponse>(
      `${GRAPH_API_URL}/${wabaId}/message_templates`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${whatsapp.tokenMeta}`,
          "Content-Type": "application/json"
        }
      }
    );

    // Actualizar template con ID de Meta
    await template.update({
      metaTemplateId: response.data.id,
      status: "PENDING", // Meta lo revisará
      whatsappId
    });

    return response.data;
  } catch (error: any) {
    const metaError = error.response?.data?.error;
    const errorMessage = metaError?.message || error.message;
    const errorCode = metaError?.code;
    const errorSubcode = metaError?.error_subcode;
    const errorUserTitle = metaError?.error_user_title;
    const errorUserMsg = metaError?.error_user_msg;
    const fbtrace_id = metaError?.fbtrace_id;

    console.error("[SubmitTemplate] ❌ Error COMPLETO de Meta:", JSON.stringify(error.response?.data, null, 2));
    console.error("[SubmitTemplate] Error de Meta:", {
      code: errorCode,
      subcode: errorSubcode,
      message: errorMessage,
      error_user_title: errorUserTitle,
      error_user_msg: errorUserMsg,
      details: metaError?.error_data,
      fbtrace_id
    });

    // Construir objeto de error con detalles de Meta
    const metaErrorDetails = {
      code: errorCode,
      subcode: errorSubcode,
      userTitle: errorUserTitle,
      userMessage: errorUserMsg,
      fbtrace_id
    };

    // Manejar errores específicos de Meta con mensajes amigables
    if (errorCode === 100) {
      const friendlyMessage = errorUserTitle || errorUserMsg || errorMessage;
      throw new AppError(friendlyMessage, 400, metaErrorDetails);
    }
    if (errorCode === 190) {
      throw new AppError("Token de Meta inválido o expirado", 401, metaErrorDetails);
    }
    if (errorCode === 368) {
      throw new AppError("Has alcanzado el límite de plantillas permitidas", 400, metaErrorDetails);
    }
    // Error de nombre duplicado
    if (errorCode === 80008) {
      throw new AppError("Ya existe una plantilla con este nombre en Meta", 400, metaErrorDetails);
    }

    // Error genérico con detalles
    const friendlyMessage = errorUserTitle || errorUserMsg || errorMessage;
    throw new AppError(friendlyMessage, 500, metaErrorDetails);
  }
};

/**
 * Construir componentes en formato Meta API
 * Soporta parámetros posicionales y con nombre
 */
const buildComponents = (template: WhatsAppTemplate): TemplateComponent[] => {
  const components: TemplateComponent[] = [];
  const isNamedFormat = template.parameterFormat === "named";

  // Header
  if (template.headerType !== "NONE" && template.headerContent) {
    const header: TemplateComponent = {
      type: "HEADER",
      format: template.headerType
    };

    if (template.headerType === "TEXT") {
      header.text = template.headerContent;
      // Si el header tiene variables
      const headerMatches = template.headerContent.match(/\{\{[^}]+\}\}/g);
      if (headerMatches && headerMatches.length > 0) {
        header.example = {
          header_text: ["Ejemplo de encabezado"]
        };
      }
    } else {
      // Para media (IMAGE, VIDEO, DOCUMENT)
      header.example = {
        header_handle: [template.headerMediaHandle || template.headerContent]
      };
    }

    components.push(header);
  }

  // Body
  const body: TemplateComponent = {
    type: "BODY",
    text: template.bodyContent
  };

  // Agregar ejemplos según el formato de parámetros
  if (template.variablesCount > 0) {
    if (isNamedFormat && template.namedVariableExamples) {
      // Formato con nombre: {{first_name}}, {{order_number}}
      body.example = {
        body_text_named_params: template.namedVariableExamples
      };
    } else if (template.variableExamples) {
      // Formato posicional: {{1}}, {{2}}
      body.example = {
        body_text: [template.variableExamples]
      };
    }
  }

  components.push(body);

  // Footer (máximo 60 caracteres, sin variables)
  if (template.footerContent) {
    components.push({
      type: "FOOTER",
      text: template.footerContent.substring(0, 60)
    });
  }

  // Buttons
  if (template.buttons && template.buttons.length > 0) {
    const formattedButtons = template.buttons.map(btn => {
      const button: any = {
        type: btn.type,
        text: btn.text
      };

      // Agregar propiedades específicas según tipo
      switch (btn.type) {
        case "URL":
          button.url = btn.url;
          if (btn.example) {
            button.example = [btn.example];
          }
          break;
        case "PHONE_NUMBER":
          button.phone_number = btn.phoneNumber;
          break;
        case "COPY_CODE":
          button.example = btn.example ? [btn.example] : ["CODIGO123"];
          break;
        // QUICK_REPLY no necesita propiedades adicionales
      }

      return button;
    });

    components.push({
      type: "BUTTONS",
      buttons: formattedButtons
    });
  }

  return components;
};

export default SubmitTemplateToMetaService;
  