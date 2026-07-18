import { Job } from "bull";
import logger, { logError, logInfo, logWarn, logDebug } from "../utils/logger";
import Campaign from "../models/Campaign";
import CampaignShipping from "../models/CampaignShipping";
import ContactList from "../models/ContactList";
import ContactListItem from "../models/ContactListItem";
import CampaignSetting from "../models/CampaignSetting";
import WhatsAppTemplate from "../models/WhatsAppTemplate";
import { getIO } from "../libs/socket";
import moment from "moment";
import lodash from "lodash";
const { isArray, isEmpty, isNil } = lodash;

// Importar add y getSettings desde queues.ts
import { add, getSettings } from "../queues";
import Whatsapp from "../models/Whatsapp";
import { sendTemplateDynamic } from "../services/MetaServices/metaSendService";

function getCampaignValidMessages(campaign) {
  const messages = [];

  if (!isEmpty(campaign.message1) && !isNil(campaign.message1)) {
    messages.push(campaign.message1);
  }
  if (!isEmpty(campaign.message2) && !isNil(campaign.message2)) {
    messages.push(campaign.message2);
  }
  if (!isEmpty(campaign.message3) && !isNil(campaign.message3)) {
    messages.push(campaign.message3);
  }
  if (!isEmpty(campaign.message4) && !isNil(campaign.message4)) {
    messages.push(campaign.message4);
  }
  if (!isEmpty(campaign.message5) && !isNil(campaign.message5)) {
    messages.push(campaign.message5);
  }

  return messages;
}

function getProcessedMessage(msg: string, variables: any[], contact: any) {
  let finalMessage = msg;

  if (finalMessage.includes("{nome}")) {
    finalMessage = finalMessage.replace(/{nome}/g, contact.name);
  }
  if (finalMessage.includes("{email}")) {
    finalMessage = finalMessage.replace(/{email}/g, contact.email);
  }
  if (finalMessage.includes("{numero}")) {
    finalMessage = finalMessage.replace(/{numero}/g, contact.number);
  }

  if (variables[0]?.value !== '[]') {
    variables.forEach(variable => {
      if (finalMessage.includes(`{${variable.key}}`)) {
        const regex = new RegExp(`{${variable.key}}`, "g");
        finalMessage = finalMessage.replace(regex, variable.value);
      }
    });
  }

  return finalMessage;
}

function randomValue(min, max) {
  return Math.floor(Math.random() * max) + min;
}

// Función para verificar horarios permitidos
const checkerWeek = async (companyId: number) => {
  const sab = moment().day() === 6;
  const dom = moment().day() === 0;

  const sabado = await CampaignSetting.findOne({
    where: { key: "sabado", companyId }
  });

  const domingo = await CampaignSetting.findOne({
    where: { key: "domingo", companyId }
  });

  if (sabado?.value === "false" && sab) {
    return true; // Pausar
  }

  if (domingo?.value === "false" && dom) {
    return true; // Pausar
  }

  return false;
};

const checkTime = async (companyId: number) => {
  const startHour = await CampaignSetting.findOne({
    where: {
      key: "startHour",
      companyId
    }
  });

  const endHour = await CampaignSetting.findOne({
    where: {
      key: "endHour",
      companyId
    }
  });

  if (!startHour || !endHour) {
    logWarn(`[WORKER] Horarios no configurados para empresa ${companyId}`);
    return true; // Permitir si no hay configuración
  }

  const hour = startHour.value as unknown as number;
  const endHours = endHour.value as unknown as number;
  const timeNow = moment().format("HH:mm") as unknown as number;

  if (timeNow <= endHours && timeNow >= hour) {
    return true;
  }

  logInfo(
    `[WORKER] Envio inicia as ${hour} e termina as ${endHours}, hora atual ${timeNow} não está dentro do horário`
  );

  return false;
};

async function getCampaign(id) {
  return await Campaign.findOne({
    where: { id },
    attributes: [
      "id", "companyId", "name",
      "message1", "message2", "message3", "message4", "message5",
      "status", "whatsappId",
      "useTemplate", "whastsAppTemplateId", "templateParams",
      "statusTicket", "openTicket"
    ],
    include: [
      {
        model: ContactList,
        as: "contactList",
        attributes: ["id", "name"],
        include: [
          {
            model: ContactListItem,
            as: "contacts",
            attributes: ["id", "name", "number", "email", "isWhatsappValid", "isGroup"],
            where: { isWhatsappValid: true }
          }
        ]
      },
      {
        model: WhatsAppTemplate,
        as: "whastsAppTemplate",
        attributes: ["id", "name", "language", "variablesCount", "bodyContent", "status"]
      }
    ]
  });
}

/**
 * Extrae los parámetros de la plantilla desde el contacto
 * Mapea las variables de la plantilla con los datos del contacto
 */
function extractTemplateParams(templateParams: Record<string, string>, contact: any): string[] {
  const params: string[] = [];

  // Si templateParams tiene valores estáticos, usarlos
  if (templateParams && Object.keys(templateParams).length > 0) {
    // Recorrer en orden: {{1}}, {{2}}, etc.
    let i = 1;
    while (templateParams[`${i}`] !== undefined) {
      let value = templateParams[`${i}`];

      // Reemplazar variables del contacto en el valor
      if (value.includes("{nome}")) {
        value = value.replace(/{nome}/g, contact.name || "");
      }
      if (value.includes("{email}")) {
        value = value.replace(/{email}/g, contact.email || "");
      }
      if (value.includes("{numero}")) {
        value = value.replace(/{numero}/g, contact.number || "");
      }

      params.push(value);
      i++;
    }
  }

  return params;
}

// Esta función manejará el procesamiento de campañas en el worker
export default async (job: Job): Promise<void> => {
  const { id, companyId, type, schedulerTimestamp } = job.data;
  logInfo(`📥 [WORKER] Procesando campaña ID=${id} para empresa=${companyId} (type: ${type || 'legacy'})`);

  if (!companyId) {
    logError(`❌ [WORKER] CompanyId es undefined para campaña ID=${id}. Job data: ${JSON.stringify(job.data)}`);
    throw new Error(`CompanyId es undefined para campaña ID=${id}`);
  }

  // ──────────────────────────────────────────────────────────────
  // GUARD 1: la campaña debe existir y no estar cancelada/finalizada
  // ──────────────────────────────────────────────────────────────
  const freshCampaign = await Campaign.findByPk(id);
  if (!freshCampaign) {
    logWarn(`⚠️ [WORKER] Campaña ID=${id} no existe — ignorando job`);
    return;
  }
  if (freshCampaign.status === "CANCELADA" || freshCampaign.status === "FINALIZADA") {
    logInfo(
      `🚫 [WORKER] Campaña ID=${id} ya está en status=${freshCampaign.status} — ignorando job`
    );
    return;
  }

  // ──────────────────────────────────────────────────────────────
  // GUARD 2: si usa plantilla Meta, validar APPROVED + conexión Meta
  // ──────────────────────────────────────────────────────────────
  if (freshCampaign.useTemplate && freshCampaign.whastsAppTemplateId) {
    const tpl = await WhatsAppTemplate.findByPk(freshCampaign.whastsAppTemplateId);
    if (!tpl || tpl.status !== "APPROVED") {
      await freshCampaign.update({ status: "FINALIZADA", completedAt: moment().toDate() });
      logError(
        `❌ [WORKER] Plantilla ID=${freshCampaign.whastsAppTemplateId} no APPROVED (status=${tpl?.status}) — campaña ID=${id} marcada FINALIZADA sin enviar`
      );
      return;
    }

    const wpp = await Whatsapp.findByPk(freshCampaign.whatsappId);
    if (!wpp || wpp.channel !== "meta" || !wpp.phoneNumberId || !wpp.tokenMeta) {
      await freshCampaign.update({ status: "FINALIZADA", completedAt: moment().toDate() });
      logError(
        `❌ [WORKER] Conexión Meta inválida para campaña ID=${id} (whatsappId=${freshCampaign.whatsappId}) — marcada FINALIZADA sin enviar`
      );
      return;
    }
  }

  try {
    // Verificar si estamos en horario permitido antes de procesar
    const isTimeAllowed = await checkTime(companyId);
    const isWeekAllowed = !(await checkerWeek(companyId));

    if (!isTimeAllowed || !isWeekAllowed) {
      logInfo(`📵 [WORKER] Fora do horário permitido para campaña ID=${id}, empresa=${companyId}. TimeAllowed: ${isTimeAllowed}, WeekAllowed: ${isWeekAllowed}.`);
      logInfo(`⏰ [WORKER] Reagendando campaña para dentro de 5 minutos...`);

      const error = new Error("Fora do horário permitido - reagendando em 5 minutos");
      (error as any).delay = 5 * 60 * 1000;
      throw error;
    }

    // Obtener la campaña (con includes de contactos y plantilla)
    const campaign = await getCampaign(id);

    if (!campaign) {
      logWarn(`❌ [WORKER] Campaña ID=${id} no encontrada (include)`);
      return;
    }

    // Verificación adicional de consistencia
    if (campaign.companyId !== companyId) {
      logError(`⚠️ [WORKER] Inconsistencia: Campaign.companyId=${campaign.companyId} vs job.companyId=${companyId}`);
    } else {
      logInfo(`✅ [WORKER] Campaign ID=${id} encontrada para empresa ${companyId}`);
    }

    // Marcar la campaña como "EM_ANDAMENTO" (si aún no lo está)
    if (campaign.status !== "EM_ANDAMENTO") {
      await campaign.update({ status: "EM_ANDAMENTO" });
    }

    // Obtener configuraciones específicas de la empresa
    const settings = await getSettings(companyId);

    // Procesar los contactos de la campaña
    const { contacts } = campaign.contactList;

    if (isArray(contacts)) {
      logInfo(`📊 [WORKER] Procesando ${contacts.length} contactos con configuraciones: messageInterval=${settings.messageInterval}s, longerIntervalAfter=${settings.longerIntervalAfter}, greaterInterval=${settings.greaterInterval}s`);

      for (let index = 0; index < contacts.length; index++) {
        const contact = contacts[index];
        try {
          // ──────────────────────────────────────────────
          // Re-check status (cancelación en caliente)
          // ──────────────────────────────────────────────
          const check = await Campaign.findByPk(id, { attributes: ["status"] });
          if (!check || check.status === "CANCELADA") {
            logInfo(
              `🚫 [WORKER] Campaña ID=${id} fue cancelada durante el procesamiento — abortando loop`
            );
            break;
          }

          // Verificar nuevamente el horario para cada contacto
          const isTimeStillAllowed = await checkTime(companyId);
          const isWeekStillAllowed = !(await checkerWeek(companyId));

          if (!isTimeStillAllowed || !isWeekStillAllowed) {
            logInfo(`[WORKER] ⏰ Horario cambió durante el procesamiento. Pausando campaña ID=${id}`);
            break; // Salir del loop
          }

          // Calcular delay usando las configuraciones específicas de la empresa
          let contactDelay = 0;
          if (index > 0) { // El primer contacto se envía inmediatamente
            if (index > settings.longerIntervalAfter) {
              // Después del límite, usar intervalo mayor
              contactDelay = index * settings.greaterInterval * 1000; // convertir a ms
            } else {
              // Antes del límite, usar intervalo normal
              contactDelay = index * settings.messageInterval * 1000; // convertir a ms
            }
          }

          // ──────────────────────────────────────────────
          // CampaignShipping: crear/actualizar antes del envío
          // ──────────────────────────────────────────────
          const [shipping] = await CampaignShipping.findOrCreate({
            where: { campaignId: campaign.id, contactId: contact.id },
            defaults: {
              number: contact.number,
              message: "",
              attemptCount: 0
            } as any
          });
          await shipping.update({ attemptCount: (shipping.attemptCount || 0) + 1 });

          // =====================================================
          // LOGICA: PLANTILLA META vs MENSAJE LIBRE BAILEYS
          // =====================================================
          const delayMinutes = Math.round(contactDelay / 60000);
          logInfo(`[WORKER] 📝 Preparando contacto ${index + 1}/${contacts.length}: ${contact.name} (delay: ${delayMinutes}min)`);

          // Obtener conexión WhatsApp para obtener credenciales Meta
          const whatsapp = await Whatsapp.findByPk(campaign.whatsappId);

          if (campaign.useTemplate && campaign.whastsAppTemplateId) {
            // ========================
            // ENVÍO POR META TEMPLATE
            // ========================
            logInfo(`[WORKER] 📤 [META-TEMPLATE] Enviando plantilla ID=${campaign.whastsAppTemplateId} a ${contact.number}`);

            // Obtener la plantilla
            const template = campaign.whastsAppTemplate;

            if (!template) {
              const errMsg = `Plantilla no encontrada: ${campaign.whastsAppTemplateId}`;
              logError(`[WORKER] ❌ ${errMsg}`);
              await shipping.update({
                failedAt: new Date(),
                errorMessage: errMsg.slice(0, 500)
              });
              continue;
            }

            // Verificar que la conexión sea Meta
            if (!whatsapp || whatsapp.channel !== "meta") {
              const errMsg = `Conexión ${campaign.whatsappId} no es Meta`;
              logWarn(`[WORKER] ⚠️ ${errMsg}, saltando envío por plantilla`);
              await shipping.update({
                failedAt: new Date(),
                errorMessage: errMsg.slice(0, 500)
              });
              continue;
            }

            // Extraer parámetros de la plantilla
            const params = extractTemplateParams(campaign.templateParams || {}, contact);

            // Enviar directamente por Meta API (no por cola)
            try {
              const result = await sendTemplateDynamic(
                contact.number,
                template.name,
                whatsapp.phoneNumberId,
                whatsapp.tokenMeta,
                params,
                template.language || "es"
              );

              logInfo(`[WORKER] ✅ [META-TEMPLATE] Enviado a ${contact.number}, messageId: ${result.messagingMessageId}`);

              await shipping.update({
                deliveredAt: new Date(),
                metaMessageId: result.messagingMessageId,
                message: template.name
              });

            } catch (templateError: any) {
              logError(`[WORKER] ❌ [META-TEMPLATE] Error enviando a ${contact.number}: ${templateError.message}`);
              await shipping.update({
                failedAt: new Date(),
                errorMessage: (templateError?.message || "Error Meta").slice(0, 500)
              });
              // Continuar con el siguiente contacto — no relanzar
              continue;
            }

          } else {
            // ========================
            // ENVÍO LEGACY (BAILEYS)
            // ========================
            const messages = getCampaignValidMessages(campaign);

            if (messages.length > 0) {
              const randomIndex = randomValue(0, messages.length);
              let message = messages[randomIndex] || "";

              // Procesar variables usando las configuraciones específicas de la empresa
              message = getProcessedMessage(message, settings.variables, contact);

              // ✅ ENVIAR JOB AL BACKEND PRINCIPAL con delay calculado
              const jobData = {
                whatsappId: campaign.whatsappId,
                data: {
                  number: contact.number,
                  body: message,
                  companyId: campaign.companyId
                }
              };

              const jobOptions = {
                delay: contactDelay,
                priority: 1,
                removeOnComplete: { age: 60 * 60, count: 100 },
                removeOnFail: { age: 60 * 60, count: 50 }
              };

              logInfo(`[WORKER] 🔍 DEBUG - Enviando job al backend:`);
              logInfo(`[WORKER] 📋 Job Data: ${JSON.stringify(jobData)}`);
              logInfo(`[WORKER] ⚙️ Job Options: ${JSON.stringify(jobOptions)}`);

              try {
                const jobSent = await add("SendMessage", jobData, jobOptions);
                // Persistir jobId para permitir cancelación (CleanupCampaignJobsService)
                await shipping.update({
                  jobId: jobSent?.id ? String(jobSent.id) : null,
                  message
                });

                const scheduledTime = moment().add(contactDelay, "milliseconds").format("HH:mm:ss");
                logInfo(`[WORKER] 📤 Job enviado al backend para ${contact.name} programado para ${scheduledTime} (delay: ${delayMinutes}min) — jobId=${jobSent?.id}`);
                logInfo(`[WORKER] ✅ Job #${index + 1}/${contacts.length} procesado exitosamente`);
              } catch (sendError: any) {
                logError(`[WORKER] ❌ Error encolando SendMessage para ${contact.number}: ${sendError.message}`);
                await shipping.update({
                  failedAt: new Date(),
                  errorMessage: (sendError?.message || "Error encolando").slice(0, 500),
                  message
                });
                continue;
              }
            }
          }
        } catch (error) {
          logError(`[WORKER] ❌ Error procesando contacto ${contact.name}: ${error.message}`);
        }
      }

      // Marcar campaña como finalizada SOLO si no fue cancelada en el ínterin
      const finalCheck = await Campaign.findByPk(id, { attributes: ["status"] });
      if (finalCheck && finalCheck.status !== "CANCELADA") {
        await campaign.update({ status: "FINALIZADA", completedAt: moment().toDate() });
      } else {
        logInfo(`[WORKER] 🚫 Campaña ID=${id} quedó como CANCELADA — no se marca FINALIZADA`);
      }
    }

    logInfo(`[WORKER] ✅ Campaña ID=${id} procesada exitosamente - ${contacts?.length || 0} jobs enviados al backend principal`);
  } catch (error) {
    logError(`[WORKER] ❌ Error procesando campaña ID=${id}: ${error.message}`);
    throw error;
  }
};
