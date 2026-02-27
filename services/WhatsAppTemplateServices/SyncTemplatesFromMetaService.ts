/**
 * SyncTemplatesFromMetaService
 * Sincroniza el estado de las plantillas desde Meta
 * Útil para actualizar estados de aprobación y obtener templates creados desde Meta Business Suite
 */

import axios from "axios";
import WhatsAppTemplate, { TemplateStatus } from "../../models/WhatsAppTemplate";
import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";

interface Request {
  companyId: number;
  whatsappId: number;
}

interface MetaTemplate {
  id: string;
  name: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED";
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  components: any[];
  rejected_reason?: string;
}

interface SyncResult {
  synced: number;
  created: number;
  updated: number;
  templates: WhatsAppTemplate[];
}

const GRAPH_API_VERSION = "v24.0";
const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const SyncTemplatesFromMetaService = async ({
  companyId,
  whatsappId
}: Request): Promise<SyncResult> => {
  // Obtener conexión de WhatsApp
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

  const wabaId = whatsapp.facebookUserId;
  if (!wabaId) {
    throw new AppError("La conexión META no tiene WABA ID configurado. Edita la conexión y agrega el WABA ID (asset_id de WhatsApp Manager).", 400);
  }

  try {
    // Obtener templates de Meta
    const response = await axios.get<{ data: MetaTemplate[] }>(
      `${GRAPH_API_URL}/${wabaId}/message_templates`,
      {
        headers: {
          Authorization: `Bearer ${whatsapp.tokenMeta}`
        },
        params: {
          fields: "id,name,status,category,language,components,rejected_reason",
          limit: 250
        }
      }
    );

    const metaTemplates = response.data.data || [];
    let created = 0;
    let updated = 0;
    const syncedTemplates: WhatsAppTemplate[] = [];

    for (const metaTemplate of metaTemplates) {
      // Buscar template existente por metaTemplateId o por nombre+idioma
      let template = await WhatsAppTemplate.findOne({
        where: {
          companyId,
          metaTemplateId: metaTemplate.id
        }
      });

      if (!template) {
        template = await WhatsAppTemplate.findOne({
          where: {
            companyId,
            name: metaTemplate.name,
            language: metaTemplate.language
          }
        });
      }

      const templateData = parseMetaTemplate(metaTemplate);

      if (template) {
        // Actualizar template existente
        await template.update({
          metaTemplateId: metaTemplate.id,
          status: metaTemplate.status as TemplateStatus,
          rejectedReason: metaTemplate.rejected_reason,
          whatsappId,
          ...templateData
        });
        updated++;
      } else {
        // Crear nuevo template (fue creado en Meta Business Suite)
        template = await WhatsAppTemplate.create({
          name: metaTemplate.name,
          metaTemplateId: metaTemplate.id,
          category: metaTemplate.category,
          language: metaTemplate.language,
          status: metaTemplate.status as TemplateStatus,
          rejectedReason: metaTemplate.rejected_reason,
          companyId,
          whatsappId,
          isActive: true,
          usageCount: 0,
          ...templateData
        });
        created++;
      }

      syncedTemplates.push(template);
    }

    return {
      synced: metaTemplates.length,
      created,
      updated,
      templates: syncedTemplates
    };
  } catch (error: any) {
    const errorMessage = error.response?.data?.error?.message || error.message;
    throw new AppError(`ERR_META_SYNC: ${errorMessage}`, 500);
  }
};

// Parsear template de Meta a nuestro formato
const parseMetaTemplate = (metaTemplate: MetaTemplate) => {
  let headerType: "NONE" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" = "NONE";
  let headerContent = "";
  let bodyContent = "";
  let footerContent = "";
  let buttons: any[] = [];
  let variablesCount = 0;

  for (const component of metaTemplate.components || []) {
    switch (component.type) {
      case "HEADER":
        headerType = component.format || "TEXT";
        headerContent = component.text || "";
        break;
      case "BODY":
        bodyContent = component.text || "";
        // Contar variables
        const matches = bodyContent.match(/\{\{\d+\}\}/g);
        variablesCount = matches ? matches.length : 0;
        break;
      case "FOOTER":
        footerContent = component.text || "";
        break;
      case "BUTTONS":
        buttons = component.buttons || [];
        break;
    }
  }

  return {
    headerType,
    headerContent,
    bodyContent,
    footerContent,
    buttons,
    variablesCount,
    components: metaTemplate.components
  };
};

export default SyncTemplatesFromMetaService;
