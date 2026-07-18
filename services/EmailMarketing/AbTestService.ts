import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * AbTestService — Servicio de A/B Testing para campanas de email
 *
 * Permite dividir la audiencia de una campana en variantes,
 * enviar cada variante a su grupo, evaluar metricas y declarar ganador.
 * Luego envia la variante ganadora al porcentaje restante de la audiencia.
 *
 * Multi-tenant: todas las operaciones filtran por companyId.
 * BD SAGRADA: nunca se eliminan registros.
 */

import { Op } from "sequelize";
import logger from "../../utils/logger";
import EmailAbTest from "../../models/EmailMarketing/EmailAbTest";
import EmailCampaign from "../../models/EmailMarketing/EmailCampaign";
import EmailCampaignRecipient from "../../models/EmailMarketing/EmailCampaignRecipient";
import ContactListItem from "../../models/ContactListItem";

// ============================================================================
// Interfaces
// ============================================================================

interface VariantData {
  id: string;
  subject?: string;
  content?: string;
  percentage: number;
  sendTime?: string;
}

interface VariantResult {
  sent: number;
  opened: number;
  clicked: number;
  openRate: string;
  clickRate: string;
}

interface AbTestResults {
  abTestId: number;
  name: string;
  testType: string;
  status: string;
  winnerVariantId: string | null;
  winnerCriteria: string;
  variants: Record<string, VariantResult>;
  decidedAt: Date | null;
}

interface CreateAbTestData {
  name: string;
  testType?: string;
  variants: VariantData[];
  winnerCriteria?: string;
  testPercentage?: number;
  testDurationHours?: number;
}

// ============================================================================
// createAbTest — Crear un A/B test para una campana
// ============================================================================

export const createAbTest = async (
  campaignId: number,
  companyId: number,
  data: CreateAbTestData
): Promise<EmailAbTest> => {
  try {
    // Verificar que la campana existe y pertenece a la company
    const campaign = await EmailCampaign.findOne({
      where: { id: campaignId, companyId }
    });

    if (!campaign) {
      throw new Error(`Campana ${campaignId} no encontrada para company ${companyId}`);
    }

    // Validar que los porcentajes de variantes sumen 100
    const totalPercentage = data.variants.reduce((sum, v) => sum + v.percentage, 0);
    if (totalPercentage !== 100) {
      throw new Error(`Los porcentajes de las variantes deben sumar 100 (actual: ${totalPercentage})`);
    }

    const abTest = await EmailAbTest.create({
      companyId,
      campaignId,
      name: data.name,
      testType: data.testType || "subject",
      variants: data.variants,
      winnerCriteria: data.winnerCriteria || "open_rate",
      testPercentage: data.testPercentage || 20,
      testDurationHours: data.testDurationHours || 4,
      status: "draft",
      results: {},
      isActive: true
    } as Partial<EmailAbTest>);

    logger.info(
      `[AbTestService] A/B test creado: id=${abTest.id}, campaignId=${campaignId}, ` +
      `tipo=${data.testType}, variantes=${data.variants.length}`
    );

    return abTest;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[AbTestService] Error creando A/B test: ${msg}`);
    throw error;
  }
};

// ============================================================================
// startAbTest — Iniciar test: dividir audiencia y enviar variantes
// ============================================================================

export const startAbTest = async (
  abTestId: number,
  companyId: number
): Promise<{ status: string; variantsSent: Record<string, number> }> => {
  try {
    const abTest = await EmailAbTest.findOne({
      where: { id: abTestId, companyId, isActive: true }
    });

    if (!abTest) {
      throw new Error(`A/B test ${abTestId} no encontrado`);
    }

    if (abTest.status !== "draft") {
      throw new Error(`A/B test ${abTestId} no puede iniciarse (status: ${abTest.status})`);
    }

    const campaign = await EmailCampaign.findOne({
      where: { id: abTest.campaignId, companyId }
    });

    if (!campaign || !campaign.contactListId) {
      throw new Error(`Campana ${abTest.campaignId} no tiene lista de contactos`);
    }

    // Obtener contactos de la lista
    const listItems = await ContactListItem.findAll({
      where: { contactListId: campaign.contactListId },
      attributes: ["id", "name", "email"]
    });

    if (listItems.length === 0) {
      throw new Error("La lista de contactos no tiene suscriptores");
    }

    // Calcular cuantos contactos van al test
    const testCount = Math.ceil(listItems.length * (abTest.testPercentage / 100));
    const testContacts = listItems.slice(0, testCount);

    const variants = abTest.variants as unknown as VariantData[];
    const variantsSent: Record<string, number> = {};
    const results: Record<string, VariantResult> = {};

    // Dividir contactos entre variantes segun porcentajes
    let startIndex = 0;
    for (const variant of variants) {
      const variantCount = Math.ceil(testContacts.length * (variant.percentage / 100));
      const variantContacts = testContacts.slice(startIndex, startIndex + variantCount);
      startIndex += variantCount;

      variantsSent[variant.id] = 0;
      results[variant.id] = { sent: 0, opened: 0, clicked: 0, openRate: "0.00", clickRate: "0.00" };

      // Determinar subject y content segun variante
      const subject = variant.subject || campaign.subject;
      const htmlContent = variant.content || campaign.htmlContent;

      // Crear recipients y encolar envio para cada contacto de esta variante
      for (const contact of variantContacts) {
        if (!contact.email) continue;

        try {
          await EmailCampaignRecipient.create({
            campaignId: campaign.id,
            companyId,
            email: contact.email,
            name: contact.name || "",
            status: "pending",
            personalizationData: {
              abTestId: abTest.id,
              variantId: variant.id,
              variantSubject: subject
            }
          } as Partial<EmailCampaignRecipient>);

          // Encolar envio individual
          try {
            const { add } = require("../../queues");
            await add("EmailSendQueue", {
              companyId,
              campaignId: campaign.id,
              to: contact.email,
              toName: contact.name || undefined,
              subject,
              htmlContent,
              from: campaign.fromEmail || process.env.MAIL_USER || "noreply@chateam.ws",
              fromName: campaign.fromName || "ChatEAM",
              metadata: { abTestId: abTest.id, variantId: variant.id }
            });
            variantsSent[variant.id]++;
            results[variant.id].sent++;
          } catch (queueError: unknown) {
            const queueMsg = queueError instanceof Error ? queueError.message : String(queueError);
            logger.error(`[AbTestService] Error encolando email variante ${variant.id}: ${queueMsg}`);
          }
        } catch (recipientError: unknown) {
          const recipientMsg = recipientError instanceof Error ? recipientError.message : String(recipientError);
          logger.error(`[AbTestService] Error creando recipient: ${recipientMsg}`);
        }
      }
    }

    // Actualizar test a running
    await abTest.update({
      status: "running",
      results
    });

    logger.info(
      `[AbTestService] A/B test iniciado: id=${abTestId}, totalTest=${testCount}, ` +
      `variantes=${JSON.stringify(variantsSent)}`
    );

    return { status: "running", variantsSent };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[AbTestService] Error iniciando A/B test: ${msg}`);
    throw error;
  }
};

// ============================================================================
// checkAndDeclareWinner — Evaluar resultados y declarar ganador
// ============================================================================

export const checkAndDeclareWinner = async (
  abTestId: number
): Promise<{ winnerId: string; results: Record<string, VariantResult> }> => {
  try {
    const abTest = await EmailAbTest.findByPk(abTestId);

    if (!abTest) {
      throw new Error(`A/B test ${abTestId} no encontrado`);
    }

    if (abTest.status !== "running") {
      throw new Error(`A/B test ${abTestId} no esta en ejecucion (status: ${abTest.status})`);
    }

    const variants = abTest.variants as unknown as VariantData[];
    const updatedResults: Record<string, VariantResult> = {};

    // Calcular metricas reales de cada variante
    for (const variant of variants) {
      const recipients = await EmailCampaignRecipient.findAll({
        where: {
          campaignId: abTest.campaignId,
          companyId: abTest.companyId,
          personalizationData: {
            [Op.contains]: { abTestId, variantId: variant.id }
          }
        }
      });

      const sent = recipients.filter(r => r.status === "sent" || r.status === "opened" || r.status === "clicked").length;
      const opened = recipients.filter(r => r.openedAt !== null).length;
      const clicked = recipients.filter(r => r.clickedAt !== null).length;

      updatedResults[variant.id] = {
        sent,
        opened,
        clicked,
        openRate: sent > 0 ? ((opened / sent) * 100).toFixed(2) : "0.00",
        clickRate: opened > 0 ? ((clicked / opened) * 100).toFixed(2) : "0.00"
      };
    }

    // Elegir ganador segun criterio
    let winnerId = variants[0]?.id || "A";
    let bestScore = -1;

    for (const variant of variants) {
      const result = updatedResults[variant.id];
      let score = 0;

      if (abTest.winnerCriteria === "open_rate") {
        score = parseFloat(result.openRate);
      } else if (abTest.winnerCriteria === "click_rate") {
        score = parseFloat(result.clickRate);
      }

      if (score > bestScore) {
        bestScore = score;
        winnerId = variant.id;
      }
    }

    await abTest.update({
      status: "completed",
      results: updatedResults,
      winnerVariantId: winnerId,
      decidedAt: new Date()
    });

    logger.info(
      `[AbTestService] Ganador declarado: abTestId=${abTestId}, ` +
      `winnerId=${winnerId}, criteria=${abTest.winnerCriteria}, ` +
      `score=${bestScore}`
    );

    return { winnerId, results: updatedResults };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[AbTestService] Error declarando ganador: ${msg}`);
    throw error;
  }
};

// ============================================================================
// sendToRemainingAudience — Enviar variante ganadora al % restante
// ============================================================================

export const sendToRemainingAudience = async (
  abTestId: number
): Promise<{ totalSent: number }> => {
  try {
    const abTest = await EmailAbTest.findByPk(abTestId);

    if (!abTest || !abTest.winnerVariantId) {
      throw new Error(`A/B test ${abTestId} no tiene ganador declarado`);
    }

    const campaign = await EmailCampaign.findOne({
      where: { id: abTest.campaignId, companyId: abTest.companyId }
    });

    if (!campaign || !campaign.contactListId) {
      throw new Error(`Campana ${abTest.campaignId} no encontrada o sin lista`);
    }

    const variants = abTest.variants as unknown as VariantData[];
    const winnerVariant = variants.find(v => v.id === abTest.winnerVariantId);

    if (!winnerVariant) {
      throw new Error(`Variante ganadora ${abTest.winnerVariantId} no encontrada`);
    }

    // Obtener todos los contactos de la lista
    const allListItems = await ContactListItem.findAll({
      where: { contactListId: campaign.contactListId },
      attributes: ["id", "name", "email"]
    });

    // Obtener emails ya enviados en el test
    const alreadySent = await EmailCampaignRecipient.findAll({
      where: {
        campaignId: campaign.id,
        companyId: abTest.companyId
      },
      attributes: ["email"]
    });

    const sentEmails = new Set(alreadySent.map(r => r.email));

    // Filtrar contactos que no recibieron el test
    const remainingContacts = allListItems.filter(
      item => item.email && !sentEmails.has(item.email)
    );

    const subject = winnerVariant.subject || campaign.subject;
    const htmlContent = winnerVariant.content || campaign.htmlContent;

    let totalSent = 0;

    for (const contact of remainingContacts) {
      try {
        await EmailCampaignRecipient.create({
          campaignId: campaign.id,
          companyId: abTest.companyId,
          email: contact.email,
          name: contact.name || "",
          status: "pending",
          personalizationData: {
            abTestId: abTest.id,
            variantId: abTest.winnerVariantId,
            isRemainder: true
          }
        } as Partial<EmailCampaignRecipient>);

        const { add } = require("../../queues");
        await add("EmailSendQueue", {
          companyId: abTest.companyId,
          campaignId: campaign.id,
          to: contact.email,
          toName: contact.name || undefined,
          subject,
          htmlContent,
          from: campaign.fromEmail || process.env.MAIL_USER || "noreply@chateam.ws",
          fromName: campaign.fromName || "ChatEAM",
          metadata: { abTestId: abTest.id, variantId: abTest.winnerVariantId, isRemainder: true }
        });

        totalSent++;
      } catch (sendError: unknown) {
        const sendMsg = sendError instanceof Error ? sendError.message : String(sendError);
        logger.error(`[AbTestService] Error enviando a remaining: ${sendMsg}`);
      }
    }

    logger.info(
      `[AbTestService] Enviado a restante: abTestId=${abTestId}, ` +
      `winnerVariant=${abTest.winnerVariantId}, totalSent=${totalSent}`
    );

    return { totalSent };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[AbTestService] Error enviando a restante: ${msg}`);
    throw error;
  }
};

// ============================================================================
// getAbTestResults — Resultados detallados de un A/B test
// ============================================================================

export const getAbTestResults = async (
  abTestId: number,
  companyId: number
): Promise<AbTestResults | null> => {
  try {
    const abTest = await EmailAbTest.findOne({
      where: { id: abTestId, companyId, isActive: true }
    });

    if (!abTest) return null;

    const variants = abTest.variants as unknown as VariantData[];
    const liveResults: Record<string, VariantResult> = {};

    // Calcular metricas en tiempo real
    for (const variant of variants) {
      const recipients = await EmailCampaignRecipient.findAll({
        where: {
          campaignId: abTest.campaignId,
          companyId,
          personalizationData: {
            [Op.contains]: { abTestId, variantId: variant.id }
          }
        }
      });

      const sent = recipients.filter(r => ["sent", "opened", "clicked", "delivered"].includes(r.status)).length;
      const opened = recipients.filter(r => r.openedAt !== null).length;
      const clicked = recipients.filter(r => r.clickedAt !== null).length;

      liveResults[variant.id] = {
        sent,
        opened,
        clicked,
        openRate: sent > 0 ? ((opened / sent) * 100).toFixed(2) : "0.00",
        clickRate: opened > 0 ? ((clicked / opened) * 100).toFixed(2) : "0.00"
      };
    }

    return {
      abTestId: abTest.id,
      name: abTest.name,
      testType: abTest.testType,
      status: abTest.status,
      winnerVariantId: abTest.winnerVariantId,
      winnerCriteria: abTest.winnerCriteria,
      variants: liveResults,
      decidedAt: abTest.decidedAt
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[AbTestService] Error obteniendo resultados: abTestId=${abTestId}, error=${msg}`);
    return null;
  }
};
