/**
 * HandleTemplateStatusWebhookService
 * Procesa las notificaciones de webhook de Meta sobre el estado de las plantillas
 *
 * Webhook field: message_template_status_update
 * Docs: https://developers.facebook.com/docs/whatsapp/business-management-api/webhooks/components
 */

import WhatsAppTemplate from "../../models/WhatsAppTemplate";
import Whatsapp from "../../models/Whatsapp";
import { getIO } from "../../libs/socket";

// Estructura del evento de Meta
interface TemplateStatusEvent {
  event: "APPROVED" | "REJECTED" | "PENDING_DELETION" | "DISABLED" | "REINSTATED" | "FLAGGED";
  message_template_id: number;
  message_template_name: string;
  message_template_language: string;
  reason?: string; // Razón del rechazo (si aplica)
}

interface MetaWebhookEntry {
  id: string; // WABA ID
  changes: Array<{
    value: TemplateStatusEvent;
    field: string;
  }>;
}

interface MetaWebhookPayload {
  object: string;
  entry: MetaWebhookEntry[];
}

/**
 * Mapea el evento de Meta a nuestro estado interno
 */
const mapMetaStatusToInternal = (
  metaEvent: string
): "APPROVED" | "REJECTED" | "PENDING" | "PAUSED" | "DISABLED" => {
  switch (metaEvent) {
    case "APPROVED":
      return "APPROVED";
    case "REJECTED":
      return "REJECTED";
    case "PENDING_DELETION":
    case "FLAGGED":
      return "PAUSED";
    case "DISABLED":
      return "DISABLED";
    case "REINSTATED":
      return "APPROVED"; // Reinstated = vuelve a estar aprobada
    default:
      return "PENDING";
  }
};

/**
 * Procesa el webhook de estado de template de Meta
 */
const HandleTemplateStatusWebhookService = async (
  payload: MetaWebhookPayload
): Promise<void> => {
  // Verificar que es un evento de WhatsApp Business Account
  if (payload.object !== "whatsapp_business_account") {
    return;
  }

  for (const entry of payload.entry) {
    const wabaId = entry.id;

    // Buscar la conexión de WhatsApp por WABA ID
    const whatsapp = await Whatsapp.findOne({
      where: {
        facebookUserId: wabaId,
        channel: "meta"
      }
    });

    if (!whatsapp) {
      console.log(`[Template Webhook] No se encontró WhatsApp para WABA ID: ${wabaId}`);
      continue;
    }

    for (const change of entry.changes) {
      // Solo procesar eventos de template status
      if (change.field !== "message_template_status_update") {
        continue;
      }

      const statusEvent = change.value;
      console.log(`[Template Webhook] Evento recibido:`, {
        event: statusEvent.event,
        templateName: statusEvent.message_template_name,
        templateId: statusEvent.message_template_id,
        language: statusEvent.message_template_language,
        reason: statusEvent.reason
      });

      // Buscar el template en nuestra base de datos
      const template = await WhatsAppTemplate.findOne({
        where: {
          companyId: whatsapp.companyId,
          name: statusEvent.message_template_name,
          language: statusEvent.message_template_language
        }
      });

      if (!template) {
        // El template puede haber sido creado en Meta Business Suite
        // Crear registro local
        console.log(`[Template Webhook] Template no encontrado localmente, creando: ${statusEvent.message_template_name}`);

        await WhatsAppTemplate.create({
          name: statusEvent.message_template_name,
          metaTemplateId: String(statusEvent.message_template_id),
          language: statusEvent.message_template_language,
          status: mapMetaStatusToInternal(statusEvent.event),
          rejectedReason: statusEvent.reason,
          companyId: whatsapp.companyId,
          whatsappId: whatsapp.id,
          category: "UTILITY", // Default, se actualizará en sync
          headerType: "NONE",
          bodyContent: "Template creado desde Meta Business Suite", // Placeholder
          variablesCount: 0,
          usageCount: 0,
          isActive: statusEvent.event === "APPROVED"
        });

        // Emitir evento por socket
        const io = getIO();
        io.to(`company-${whatsapp.companyId}`).emit("whatsapp-template:created", {
          name: statusEvent.message_template_name,
          status: mapMetaStatusToInternal(statusEvent.event),
          action: "created_from_webhook"
        });

        continue;
      }

      // Actualizar el template existente
      const newStatus = mapMetaStatusToInternal(statusEvent.event);
      const updateData: any = {
        status: newStatus,
        metaTemplateId: String(statusEvent.message_template_id)
      };

      // Agregar razón de rechazo si existe
      if (statusEvent.reason) {
        updateData.rejectedReason = statusEvent.reason;
      }

      // Si fue aprobado, limpiar razón de rechazo
      if (newStatus === "APPROVED") {
        updateData.rejectedReason = null;
      }

      await template.update(updateData);

      console.log(`[Template Webhook] Template actualizado: ${template.name} -> ${newStatus}`);

      // Emitir evento por socket para actualizar UI en tiempo real
      const io = getIO();
      io.to(`company-${whatsapp.companyId}`).emit("whatsapp-template:updated", {
        templateId: template.id,
        name: template.name,
        status: newStatus,
        rejectedReason: statusEvent.reason,
        action: "status_updated"
      });
    }
  }
};

/**
 * Verifica si un payload de webhook contiene eventos de template status
 */
export const isTemplateStatusWebhook = (payload: any): boolean => {
  if (payload.object !== "whatsapp_business_account") {
    return false;
  }

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === "message_template_status_update") {
        return true;
      }
    }
  }

  return false;
};

export default HandleTemplateStatusWebhookService;
