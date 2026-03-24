/**
 * AutomationEngineService — Motor de automatizaciones de email marketing
 *
 * Evalua triggers, ejecuta automatizaciones con delay, y procesa
 * hooks de eventos (contacto agregado, tag asignado, campana abierta, etc.)
 *
 * Multi-tenant: todas las operaciones filtran por companyId.
 * BD SAGRADA: nunca se eliminan registros, solo se actualizan estados.
 */

import { Op } from "sequelize";
import logger from "../../utils/logger";
import EmailAutomation from "../../models/EmailMarketing/EmailAutomation";
import EmailCampaignRecipient from "../../models/EmailMarketing/EmailCampaignRecipient";
import EmailTemplate from "../../models/EmailMarketing/EmailTemplate";
import ContactListItem from "../../models/ContactListItem";
import Contact from "../../models/Contact";

// ============================================================================
// Interfaces
// ============================================================================

interface TriggerConfig {
  listId?: number;
  tagId?: number;
  campaignId?: number;
  delay?: number;
  inactiveDays?: number;
  dateField?: string;
  linkUrl?: string;
  [key: string]: unknown;
}

interface AutomationStats {
  automationId: number;
  name: string;
  status: string;
  totalTriggered: number;
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  openRate: string;
  clickRate: string;
  lastTriggeredAt: Date | null;
}

// ============================================================================
// evaluateTrigger — Verifica si un contacto cumple el trigger de una automatizacion
// ============================================================================

export const evaluateTrigger = async (
  automationId: number,
  contactId: number,
  eventType: string,
  eventData: Record<string, unknown>
): Promise<boolean> => {
  try {
    const automation = await EmailAutomation.findByPk(automationId);

    if (!automation || automation.status !== "active" || !automation.isActive) {
      return false;
    }

    const triggerConfig = (automation.triggerConfig || {}) as TriggerConfig;

    switch (automation.triggerType) {
      case "contact_added":
        // Verificar que el contacto fue agregado a la lista configurada
        if (eventType !== "contact_added") return false;
        if (triggerConfig.listId && eventData.contactListId !== triggerConfig.listId) {
          return false;
        }
        return true;

      case "contact_tag_added":
        // Verificar que se asigno el tag configurado
        if (eventType !== "contact_tag_added") return false;
        if (triggerConfig.tagId && eventData.tagId !== triggerConfig.tagId) {
          return false;
        }
        return true;

      case "campaign_opened":
        if (eventType !== "campaign_opened") return false;
        if (triggerConfig.campaignId && eventData.campaignId !== triggerConfig.campaignId) {
          return false;
        }
        return true;

      case "campaign_not_opened":
        if (eventType !== "campaign_not_opened") return false;
        if (triggerConfig.campaignId && eventData.campaignId !== triggerConfig.campaignId) {
          return false;
        }
        return true;

      case "link_clicked":
        if (eventType !== "link_clicked") return false;
        if (triggerConfig.linkUrl && eventData.linkUrl !== triggerConfig.linkUrl) {
          return false;
        }
        return true;

      case "date_trigger":
        // date_trigger se evalua en un CronJob, no por eventos
        return eventType === "date_trigger";

      case "inactivity":
        // inactivity se evalua en un CronJob
        return eventType === "inactivity";

      default:
        logger.warn(
          `[AutomationEngine] Tipo de trigger desconocido: ${automation.triggerType} ` +
          `(automationId=${automationId})`
        );
        return false;
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[AutomationEngine] Error evaluando trigger: automationId=${automationId}, error=${msg}`);
    return false;
  }
};

// ============================================================================
// executeAutomation — Ejecuta la automatizacion: aplica delay + envia email
// ============================================================================

export const executeAutomation = async (
  automationId: number,
  contactId: number
): Promise<boolean> => {
  try {
    const automation = await EmailAutomation.findByPk(automationId, {
      include: [{ model: EmailTemplate, as: "template" }]
    });

    if (!automation || automation.status !== "active" || !automation.isActive) {
      logger.warn(
        `[AutomationEngine] Automatizacion no activa o no encontrada: id=${automationId}`
      );
      return false;
    }

    const contact = await Contact.findByPk(contactId);
    if (!contact || !contact.email) {
      logger.warn(
        `[AutomationEngine] Contacto sin email: contactId=${contactId}, automationId=${automationId}`
      );
      return false;
    }

    // Determinar contenido del email
    let subject = automation.emailSubject || "";
    let htmlContent = automation.emailContent || "";

    if (automation.emailTemplateId && automation.template) {
      subject = subject || automation.template.subject;
      htmlContent = htmlContent || automation.template.htmlContent;
    }

    if (!subject || !htmlContent) {
      logger.error(
        `[AutomationEngine] Automatizacion sin contenido: automationId=${automationId}`
      );
      return false;
    }

    // Crear recipient para tracking
    const recipient = await EmailCampaignRecipient.create({
      companyId: automation.companyId,
      contactId: contact.id,
      email: contact.email,
      name: contact.name || "",
      status: "pending",
      personalizationData: { automationId, triggerType: automation.triggerType }
    } as Partial<EmailCampaignRecipient>);

    // Enviar via ProviderFactory
    try {
      const { ProviderFactory } = require("./providers/ProviderFactory");
      const provider = await ProviderFactory.getProvider(Number(automation.companyId));

      const result = await provider.sendEmail({
        to: contact.email,
        from: process.env.MAIL_USER || "noreply@chateam.ws",
        fromName: "ChatEAM",
        subject,
        htmlContent
      });

      if (result.success) {
        await recipient.update({
          status: "sent",
          sentAt: new Date(),
          providerMessageId: result.messageId || null
        });

        await automation.update({
          totalTriggered: automation.totalTriggered + 1,
          totalSent: automation.totalSent + 1,
          lastTriggeredAt: new Date()
        });

        logger.info(
          `[AutomationEngine] Email enviado: automationId=${automationId}, ` +
          `contactId=${contactId}, email=${contact.email}`
        );
        return true;
      } else {
        await recipient.update({
          status: "failed",
          errorMessage: result.error || "Error desconocido"
        });

        logger.error(
          `[AutomationEngine] Error enviando email: automationId=${automationId}, ` +
          `contactId=${contactId}, error=${result.error}`
        );
        return false;
      }
    } catch (sendError: unknown) {
      const sendMsg = sendError instanceof Error ? sendError.message : String(sendError);
      await recipient.update({
        status: "failed",
        errorMessage: sendMsg
      });
      logger.error(
        `[AutomationEngine] Excepcion enviando email: automationId=${automationId}, error=${sendMsg}`
      );
      return false;
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[AutomationEngine] Error ejecutando automatizacion: id=${automationId}, error=${msg}`);
    return false;
  }
};

// ============================================================================
// processContactAdded — Hook: contacto agregado a lista
// ============================================================================

export const processContactAdded = async (
  companyId: number,
  contactId: number,
  contactListId: number
): Promise<void> => {
  try {
    const automations = await EmailAutomation.findAll({
      where: {
        companyId,
        triggerType: "contact_added",
        status: "active",
        isActive: true
      }
    });

    for (const automation of automations) {
      const shouldTrigger = await evaluateTrigger(
        automation.id,
        contactId,
        "contact_added",
        { contactListId }
      );

      if (shouldTrigger) {
        if (automation.delaySeconds > 0) {
          // Encolar con delay
          try {
            const { add } = require("../../queues");
            await add("EmailAutomationQueue", {
              automationId: automation.id,
              contactId,
              companyId
            }, {
              delay: automation.delaySeconds * 1000,
              removeOnComplete: { age: 3600, count: 100 },
              removeOnFail: { age: 86400, count: 500 }
            });
            logger.info(
              `[AutomationEngine] Automatizacion encolada con delay: ` +
              `id=${automation.id}, contactId=${contactId}, delay=${automation.delaySeconds}s`
            );
          } catch (queueError: unknown) {
            const queueMsg = queueError instanceof Error ? queueError.message : String(queueError);
            logger.error(`[AutomationEngine] Error encolando automatizacion: ${queueMsg}`);
          }
        } else {
          await executeAutomation(automation.id, contactId);
        }
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[AutomationEngine] Error en processContactAdded: ${msg}`);
  }
};

// ============================================================================
// processTagAdded — Hook: tag asignado a contacto
// ============================================================================

export const processTagAdded = async (
  companyId: number,
  contactId: number,
  tagId: number
): Promise<void> => {
  try {
    const automations = await EmailAutomation.findAll({
      where: {
        companyId,
        triggerType: "contact_tag_added",
        status: "active",
        isActive: true
      }
    });

    for (const automation of automations) {
      const shouldTrigger = await evaluateTrigger(
        automation.id,
        contactId,
        "contact_tag_added",
        { tagId }
      );

      if (shouldTrigger) {
        if (automation.delaySeconds > 0) {
          try {
            const { add } = require("../../queues");
            await add("EmailAutomationQueue", {
              automationId: automation.id,
              contactId,
              companyId
            }, {
              delay: automation.delaySeconds * 1000,
              removeOnComplete: { age: 3600, count: 100 },
              removeOnFail: { age: 86400, count: 500 }
            });
          } catch (queueError: unknown) {
            const queueMsg = queueError instanceof Error ? queueError.message : String(queueError);
            logger.error(`[AutomationEngine] Error encolando automatizacion tag: ${queueMsg}`);
          }
        } else {
          await executeAutomation(automation.id, contactId);
        }
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[AutomationEngine] Error en processTagAdded: ${msg}`);
  }
};

// ============================================================================
// processCampaignEvent — Hook: evento de campana (opened/clicked)
// ============================================================================

export const processCampaignEvent = async (
  companyId: number,
  recipientId: number,
  eventType: string
): Promise<void> => {
  try {
    // Obtener el recipient para saber el contactId
    const recipient = await EmailCampaignRecipient.findByPk(recipientId);
    if (!recipient || !recipient.contactId) return;

    const triggerType = eventType === "opened" ? "campaign_opened" : "link_clicked";

    const automations = await EmailAutomation.findAll({
      where: {
        companyId,
        triggerType,
        status: "active",
        isActive: true
      }
    });

    for (const automation of automations) {
      const shouldTrigger = await evaluateTrigger(
        automation.id,
        recipient.contactId,
        triggerType,
        {
          campaignId: recipient.campaignId,
          recipientId
        }
      );

      if (shouldTrigger) {
        if (automation.delaySeconds > 0) {
          try {
            const { add } = require("../../queues");
            await add("EmailAutomationQueue", {
              automationId: automation.id,
              contactId: recipient.contactId,
              companyId
            }, {
              delay: automation.delaySeconds * 1000,
              removeOnComplete: { age: 3600, count: 100 },
              removeOnFail: { age: 86400, count: 500 }
            });
          } catch (queueError: unknown) {
            const queueMsg = queueError instanceof Error ? queueError.message : String(queueError);
            logger.error(`[AutomationEngine] Error encolando campaign event: ${queueMsg}`);
          }
        } else {
          await executeAutomation(automation.id, recipient.contactId);
        }
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[AutomationEngine] Error en processCampaignEvent: ${msg}`);
  }
};

// ============================================================================
// processInactivity — CronJob: detectar contactos inactivos
// ============================================================================

export const processInactivity = async (companyId: number): Promise<void> => {
  try {
    const automations = await EmailAutomation.findAll({
      where: {
        companyId,
        triggerType: "inactivity",
        status: "active",
        isActive: true
      }
    });

    if (automations.length === 0) return;

    for (const automation of automations) {
      const triggerConfig = (automation.triggerConfig || {}) as TriggerConfig;
      const inactiveDays = triggerConfig.inactiveDays || 30;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

      // Obtener contactos de la lista que no tienen actividad reciente
      let contactIds: number[] = [];

      if (automation.contactListId) {
        const listItems = await ContactListItem.findAll({
          where: { contactListId: automation.contactListId },
          attributes: ["contactId"]
        });
        contactIds = listItems
          .map(item => (item as unknown as { contactId: number }).contactId)
          .filter(Boolean);
      }

      if (contactIds.length === 0) continue;

      // Buscar recipients que NO tienen actividad reciente
      const activeRecipients = await EmailCampaignRecipient.findAll({
        where: {
          companyId,
          contactId: { [Op.in]: contactIds },
          [Op.or]: [
            { openedAt: { [Op.gte]: cutoffDate } },
            { clickedAt: { [Op.gte]: cutoffDate } }
          ]
        },
        attributes: ["contactId"],
        group: ["contactId"]
      });

      const activeContactIds = new Set(
        activeRecipients.map(r => (r as unknown as { contactId: number }).contactId)
      );

      const inactiveContactIds = contactIds.filter(id => !activeContactIds.has(id));

      logger.info(
        `[AutomationEngine] Inactividad: automationId=${automation.id}, ` +
        `total=${contactIds.length}, inactivos=${inactiveContactIds.length}`
      );

      for (const contactId of inactiveContactIds) {
        try {
          const { add } = require("../../queues");
          await add("EmailAutomationQueue", {
            automationId: automation.id,
            contactId,
            companyId
          }, {
            removeOnComplete: { age: 3600, count: 100 },
            removeOnFail: { age: 86400, count: 500 }
          });
        } catch (queueError: unknown) {
          const queueMsg = queueError instanceof Error ? queueError.message : String(queueError);
          logger.error(`[AutomationEngine] Error encolando inactivity: ${queueMsg}`);
        }
      }
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[AutomationEngine] Error en processInactivity: ${msg}`);
  }
};

// ============================================================================
// getAutomationStats — Estadisticas de una automatizacion
// ============================================================================

export const getAutomationStats = async (
  automationId: number,
  companyId: number
): Promise<AutomationStats | null> => {
  try {
    const automation = await EmailAutomation.findOne({
      where: { id: automationId, companyId, isActive: true }
    });

    if (!automation) return null;

    const openRate = automation.totalSent > 0
      ? ((automation.totalOpened / automation.totalSent) * 100).toFixed(2)
      : "0.00";

    const clickRate = automation.totalOpened > 0
      ? ((automation.totalClicked / automation.totalOpened) * 100).toFixed(2)
      : "0.00";

    return {
      automationId: automation.id,
      name: automation.name,
      status: automation.status,
      totalTriggered: automation.totalTriggered,
      totalSent: automation.totalSent,
      totalOpened: automation.totalOpened,
      totalClicked: automation.totalClicked,
      openRate,
      clickRate,
      lastTriggeredAt: automation.lastTriggeredAt
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[AutomationEngine] Error obteniendo stats: automationId=${automationId}, error=${msg}`);
    return null;
  }
};
