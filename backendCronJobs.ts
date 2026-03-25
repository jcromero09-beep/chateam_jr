/**
 * Backend CronJobs
 *
 * Estos CronJobs DEBEN correr en el BACKEND porque requieren:
 * - Socket.IO (getIO) para emitir eventos en tiempo real
 * - WhatsApp connections (getWbot, SendMessage) para enviar mensajes
 *
 * NO pueden correr en el worker separado.
 */

import * as Sentry from "@sentry/node";
import moment from "moment";
import { Op } from "sequelize";
import { isNil } from "lodash";

import logger from "./utils/logger";
import { getIO } from "./libs/socket";
import { getWbot } from "./libs/wbot";
import { SendMessage } from "./helpers/SendMessage";
import SendWhatsAppMessage from "./services/WbotServices/SendWhatsAppMessage";
import formatBody from "./helpers/Mustache";

import Company from "./models/Company";
import User from "./models/User";
import Whatsapp from "./models/Whatsapp";
import Ticket from "./models/Ticket";
import Contact from "./models/Contact";
import Queue from "./models/Queue";
import Queues from "./models/Queue";
import Plan from "./models/Plan";
import Invoices from "./models/Invoices";
import Tag from "./models/Tag";
import TicketTag from "./models/TicketTag";
import UserQueue from "./models/UserQueue";
import CompaniesSettings from "./models/CompaniesSettings";

import { ClosedAllOpenTickets } from "./services/WbotServices/wbotClosedTickets";
import ShowContactService from "./services/ContactServices/ShowContactService";
import ShowTicketService from "./services/TicketServices/ShowTicketService";
import UpdateTicketService from "./services/TicketServices/UpdateTicketService";
import CreateLogTicketService from "./services/TicketServices/CreateLogTicketService";

// Imports para recordatorios de citas
import Appointment from "./models/Appointments/Appointment";
import AppointmentReminder from "./models/Appointments/AppointmentReminder";
import AppointmentService from "./models/AppointmentService";
import ReminderTemplate from "./models/Appointments/ReminderTemplate";
import FindOrCreateTicketService from "./services/TicketServices/FindOrCreateTicketService";
import CreateMessageService from "./services/MessageServices/CreateMessageService";
import { v4 as uuidv4 } from "uuid";

import KanbanMovementLog from "./models/KanbanMovementLog";
import Message from "./models/Message";
import { timeLaneToDate } from "./helpers/timeLane";

import cron from "node-cron";

// ============================================================
// CRONJOB 1: handleCloseTicketsAutomatic
// Cierra tickets automáticamente por inactividad
// ============================================================
function handleCloseTicketsAutomatic() {
  cron.schedule('*/1 * * * *', async () => {
    const companies = await Company.findAll({
      where: { status: "true" }
    });

    for (const c of companies) {
      try {
        await ClosedAllOpenTickets(c.id);
      } catch (e: any) {
        Sentry.captureException(e);
        logger.error(`ClosedAllOpenTickets -> Company ${c.id}: error - ${e.message}`);
      }
    }
  });
  logger.info("✅ [CRON] handleCloseTicketsAutomatic iniciado (cada 1 min)");
}

// ============================================================
// CRONJOB 2: handleProcessLanes (Kanban)
// Mueve tickets entre etapas automáticamente
// ============================================================
function handleProcessLanes() {
  cron.schedule('*/1 * * * *', async () => {
    const companies = await Company.findAll({
      include: [{
        model: Plan,
        as: "plan",
        attributes: ["id", "name", "useKanban"],
        where: { useKanban: true }
      }]
    });

    for (const c of companies) {
      try {
        const companyId = c.id;
        const BATCH_SIZE = 50;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          const ticketTags = await TicketTag.findAll({
            include: [{
              model: Ticket,
              as: "ticket",
              where: {
                status: "open",
                fromMe: true,
                companyId
              },
              attributes: ["id", "contactId", "updatedAt", "whatsappId"]
            }, {
              model: Tag,
              as: "tag",
              attributes: ["id", "timeLane", "timeLaneUnit", "nextLaneId", "greetingMessageLane"],
              where: { companyId }
            }],
            limit: BATCH_SIZE,
            offset
          });

          if (ticketTags.length < BATCH_SIZE) hasMore = false;
          offset += BATCH_SIZE;

          // Pre-cargar nextTags para evitar N+1
          const nextLaneIds = [...new Set(
            ticketTags
              .filter(t => !isNil(t?.tag?.nextLaneId) && t.tag.nextLaneId > 0)
              .map(t => t.tag.nextLaneId)
          )];
          const nextTags = nextLaneIds.length > 0
            ? await Tag.findAll({ where: { id: nextLaneIds } })
            : [];
          const nextTagMap = new Map(nextTags.map(t => [t.id, t]));

          for (const t of ticketTags) {
            if (!isNil(t?.tag.nextLaneId) && t?.tag.nextLaneId > 0 && t?.tag.timeLane > 0) {
              const nextTag = nextTagMap.get(t.tag.nextLaneId);
              if (!nextTag) continue;

              const dataLimite = timeLaneToDate(Number(t.tag.timeLane), t.tag.timeLaneUnit || 'hours');
              const dataUltimaInteracaoChamado = new Date(t.ticket.updatedAt);

              if (dataUltimaInteracaoChamado < dataLimite) {
                await TicketTag.destroy({ where: { ticketId: t.ticketId, tagId: t.tagId } });
                await TicketTag.create({ ticketId: t.ticketId, tagId: nextTag.id });

                // Log del movimiento Kanban
                try {
                  await KanbanMovementLog.create({
                    ticketId: t.ticketId,
                    companyId,
                    fromTagId: t.tagId,
                    toTagId: nextTag.id,
                    movedBy: 'system',
                    reason: `timeLane expirado (${t.tag.timeLane} ${t.tag.timeLaneUnit || 'hours'})`
                  });
                } catch (logErr) {
                  // No fallar por error de log
                }

                const whatsapp = await Whatsapp.findByPk(t.ticket.whatsappId);

                if (!isNil(nextTag.greetingMessageLane) && nextTag.greetingMessageLane !== "") {
                  const contact = await Contact.findByPk(t.ticket.contactId);
                  const ticketUpdate = await ShowTicketService(t.ticketId, companyId);

                  await SendMessage(whatsapp, {
                    number: contact.number,
                    body: `${formatBody(nextTag.greetingMessageLane, ticketUpdate)}`,
                    mediaPath: null,
                    companyId: companyId
                  }, contact.isGroup);
                }
              }
            }
          }
        }
      } catch (e: any) {
        Sentry.captureException(e);
        logger.error(`ProcessLanes -> Company ${c.id}: error - ${e.message}`);
      }
    }
  });
  logger.info("✅ [CRON] handleProcessLanes (Kanban) iniciado (cada 1 min)");
}

// ============================================================
// CRONJOB 3: handleRandomUser
// Distribuye tickets aleatoriamente entre usuarios
// ============================================================
function handleRandomUser() {
  cron.schedule('*/2 * * * *', async () => {
    try {
      const companies = await Company.findAll({
        attributes: ['id', 'name'],
        where: { status: "true" },
        include: [{
          model: Queues,
          attributes: ["id", "name", "ativarRoteador", "tempoRoteador"],
          where: {
            ativarRoteador: true,
            tempoRoteador: { [Op.ne]: 0 }
          }
        }]
      });

      const getRandomUserId = (userIds: number[]) => {
        const randomIndex = Math.floor(Math.random() * userIds.length);
        return userIds[randomIndex];
      };

      const findUserById = async (userId: number, companyId: number) => {
        try {
          const user = await User.findOne({
            where: { id: userId, companyId }
          });

          if (user && user?.profile === "user") {
            return user.online === true ? user.id : 0;
          }
          return 0;
        } catch (errorV) {
          Sentry.captureException(errorV);
          logger.error(`SearchForUsersRandom -> VerifyUsersRandom: error - ${errorV.message}`);
          return 0;
        }
      };

      for (const c of companies) {
        for (const q of c.queues) {
          const { count, rows: tickets } = await Ticket.findAndCountAll({
            where: {
              companyId: c.id,
              status: "pending",
              queueId: q.id,
            }
          });

          if (count > 0) {
            for (const ticket of tickets) {
              const { queueId, userId } = ticket;
              const tempoRoteador = q.tempoRoteador;

              const userQueues = await UserQueue.findAll({
                where: { queueId }
              });

              const userIds = userQueues.map((uq) => uq.userId);
              const tempoPassadoB = moment().subtract(tempoRoteador, "minutes").utc().toDate();
              const updatedAtV = new Date(ticket.updatedAt);

              const settings = await CompaniesSettings.findOne({
                where: { companyId: ticket.companyId }
              });
              const sendGreetingMessageOneQueues = settings?.sendGreetingMessageOneQueues === "enabled";

              if (!userId) {
                const randomUserId = getRandomUserId(userIds);

                if (randomUserId !== undefined && await findUserById(randomUserId, ticket.companyId) > 0) {
                  if (sendGreetingMessageOneQueues) {
                    const ticketToSend = await ShowTicketService(ticket.id, ticket.companyId);
                    await SendWhatsAppMessage({
                      body: `\u200e *Asistente virtual*:\nPor favor, espere mientras localizamos a un asistente... En breve será atendido.`,
                      ticket: ticketToSend
                    });
                  }

                  await UpdateTicketService({
                    ticketData: { status: "pending", userId: randomUserId },
                    ticketId: ticket.id,
                    companyId: ticket.companyId
                  });

                  logger.info(`Ticket ID ${ticket.id} actualizado a UserId ${randomUserId}`);
                }
              } else if (userIds.includes(userId)) {
                if (tempoPassadoB > updatedAtV) {
                  const availableUserIds = userIds.filter((id) => id !== userId);

                  if (availableUserIds.length > 0) {
                    const randomUserId = getRandomUserId(availableUserIds);

                    if (randomUserId !== undefined && await findUserById(randomUserId, ticket.companyId) > 0) {
                      if (sendGreetingMessageOneQueues) {
                        const ticketToSend = await ShowTicketService(ticket.id, ticket.companyId);
                        await SendWhatsAppMessage({
                          body: "*Asistente virtual*:\nPor favor, espere mientras localizamos a un asistente... En breve será atendido.",
                          ticket: ticketToSend
                        });
                      }

                      await UpdateTicketService({
                        ticketData: { status: "pending", userId: randomUserId },
                        ticketId: ticket.id,
                        companyId: ticket.companyId
                      });

                      logger.info(`Ticket ID ${ticket.id} actualizado a UserId ${randomUserId}`);
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (e: any) {
      Sentry.captureException(e);
      logger.error(`SearchForUsersRandom -> VerifyUsersRandom: error - ${e.message}`);
    }
  });
  logger.info("✅ [CRON] handleRandomUser iniciado (cada 2 min)");
}

// ============================================================
// CRONJOB 4: handleVerifyQueue (queueMonitor)
// Mueve tickets sin cola a una cola por defecto
// ============================================================
function handleVerifyQueue() {
  cron.schedule('* * * * *', async () => {
    try {
      const companies = await Company.findAll({
        attributes: ['id', 'name'],
        where: { status: "true" },
        include: [{
          model: Whatsapp,
          attributes: ["id", "name", "status", "timeSendQueue", "sendIdQueue"]
        }]
      });

      for (const c of companies) {
        for (const w of c.whatsapps) {
          if (w.status === "CONNECTED") {
            const companyId = c.id;
            const moveQueue = w.timeSendQueue ? w.timeSendQueue : 0;
            const moveQueueId = w.sendIdQueue;

            if (moveQueue > 0) {
              if (!isNaN(moveQueueId) && Number.isInteger(moveQueueId)) {
                const tempoPassado = moment().subtract(moveQueue, "minutes").utc().format();

                const { count, rows: tickets } = await Ticket.findAndCountAll({
                  attributes: ["id"],
                  where: {
                    status: "pending",
                    queueId: null,
                    companyId: companyId,
                    whatsappId: w.id,
                    updatedAt: { [Op.lt]: tempoPassado }
                  },
                  include: [
                    { model: Contact, as: "contact", attributes: ["id", "name", "number", "email", "profilePicUrl", "acceptAudioMessage", "active", "disableBot", "urlPicture"] },
                    { model: Queue, as: "queue", attributes: ["id", "name", "color"] },
                    { model: Whatsapp, as: "whatsapp", attributes: ["id", "name", "expiresTicket", "groupAsTicket"] }
                  ]
                });

                if (count > 0) {
                  for (const ticket of tickets) {
                    await ticket.update({ queueId: moveQueueId });

                    await CreateLogTicketService({
                      userId: null,
                      queueId: moveQueueId,
                      ticketId: ticket.id,
                      type: "redirect"
                    });

                    await ticket.reload();

                    const io = getIO();
                    io.of(String(companyId)).emit(`company-${companyId}-ticket`, {
                      action: "update",
                      ticket,
                      ticketId: ticket.id
                    });

                    logger.info(`Pérdida de asistencia: ${ticket.id} - Empresa: ${companyId}`);
                  }
                }
              }
            }
          }
        }
      }
    } catch (e: any) {
      Sentry.captureException(e);
      logger.error(`SearchForQueue -> VerifyQueue: error - ${e.message}`);
    }
  });
  logger.info("✅ [CRON] handleVerifyQueue (queueMonitor) iniciado (cada 1 min)");
}

// ============================================================
// CRONJOB 5: handleInvoiceCreate
// Genera facturas y desactiva WhatsApp al vencer
// ============================================================
function handleInvoiceCreate() {
  cron.schedule('0 0 * * *', async () => {
    logger.info("GENERANDO FACTURAS...");

    const companies = await Company.findAll();

    for (const c of companies) {
      const status = c.status;
      const dueDate = moment(c.dueDate);
      const today = moment();

      const daysUntilDue = dueDate.diff(today, 'days');
      const daysAfterDue = today.diff(dueDate, 'days');

      // 1. Generar factura 16 días antes del vencimiento
      if (daysUntilDue <= 16 && daysUntilDue >= 0) {
        try {
          const plan = await Plan.findByPk(c.planId);
          if (!plan) continue;

          const valuePlan = parseFloat(plan.amount.replace(",", "."));

          const existingInvoice = await Invoices.findOne({
            where: { companyId: c.id, status: 'open' }
          });

          if (existingInvoice) {
            await existingInvoice.update({ dueDate: dueDate.toISOString() });
            logger.info(`Factura actualizada ID: ${existingInvoice.id}`);
          } else {
            const newInvoice = await Invoices.create({
              companyId: c.id,
              dueDate: dueDate.toISOString(),
              detail: plan.name,
              status: 'open',
              value: valuePlan,
              users: plan.users,
              connections: plan.connections,
              queues: plan.queues
            });
            logger.info(`Nueva factura creada ID: ${newInvoice.id}`);
          }
        } catch (error: any) {
          logger.error(`Error al generar factura para empresa ${c.id}: ${error.message}`);
        }
      }

      // 2. Desactivar WhatsApp al día siguiente del vencimiento
      if (daysAfterDue >= 1 && status) {
        logger.info(`EMPRESA: ${c.id} - Vencimiento superado (${daysAfterDue} días). Desactivando WhatsApp...`);

        try {
          const whatsapps = await Whatsapp.findAll({
            where: { companyId: c.id },
            attributes: ['id', 'status', 'session']
          });

          for (const whatsapp of whatsapps) {
            if (whatsapp.session) {
              await whatsapp.update({ status: "DISCONNECTED", session: "" });
              try {
                const wbot = getWbot(whatsapp.id);
                await wbot.logout();
              } catch (e) {
                // WhatsApp ya desconectado
              }
              logger.info(`WhatsApp ${whatsapp.id} desconectado`);
            }
          }
        } catch (error: any) {
          logger.error(`Error al desactivar WhatsApp para empresa ${c.id}: ${error.message}`);
        }
      }
    }
  });
  logger.info("✅ [CRON] handleInvoiceCreate iniciado (cada día a medianoche)");
}

// ============================================================
// CRONJOB 6: handleAppointmentReminders
// Procesa recordatorios de citas y los envía por WhatsApp
// Guarda el mensaje en el ticket para que aparezca en la conversación
// ============================================================
function handleAppointmentReminders() {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();

      // Buscar recordatorios pendientes que ya deberían haberse enviado
      const pendingReminders = await AppointmentReminder.findAll({
        where: {
          status: 'pending',
          remindAt: { [Op.lte]: now }
        },
        include: [
          {
            model: Appointment,
            as: 'appointment',
            where: {
              status: { [Op.notIn]: ['cancelled', 'completed'] }
            },
            include: [
              { model: Contact, as: 'contact' },
              { model: AppointmentService, as: 'service' },
              { model: ReminderTemplate, as: 'reminderTemplate' },
              { model: User, as: 'assignedUser', attributes: ['id', 'name'] }
            ]
          }
        ],
        limit: 50
      });

      if (pendingReminders.length === 0) {
        return;
      }

      logger.info(`📅 [CRON] Procesando ${pendingReminders.length} recordatorios de citas pendientes`);

      for (const reminder of pendingReminders) {
        try {
          const appointment = (reminder as any).appointment;
          const contact = appointment?.contact;
          const service = appointment?.service;

          // DEBUG: Check company IDs
          const reminderCompanyId = Number(reminder.companyId);
          const appointmentCompanyId = Number(appointment?.companyId);
          const contactCompanyId = Number(contact?.companyId);

          logger.info(`[CRON] DEBUG - Reminder companyId: ${reminderCompanyId}`);
          logger.info(`[CRON] DEBUG - Appointment companyId: ${appointmentCompanyId}`);
          logger.info(`[CRON] DEBUG - Contact companyId: ${contactCompanyId}`);

          // Use Number() to ensure proper comparison (avoid string vs number issues)
          const companyMatch = reminderCompanyId === appointmentCompanyId && appointmentCompanyId === contactCompanyId;
          logger.info(`[CRON] DEBUG - Company IDs match: ${companyMatch}`);

          // Check company consistency
          if (!companyMatch) {
            logger.error(`❌ [CRON] Company ID mismatch for reminder ${reminder.id}: reminder=${reminderCompanyId}, appointment=${appointmentCompanyId}, contact=${contactCompanyId}`);
            await AppointmentReminder.update(
              { status: 'failed', errorMessage: 'Company ID mismatch - contact from different company' },
              { where: { id: reminder.id } }
            );
            continue;
          }

          if (!contact || !contact.number) {
            logger.warn(`⚠️ [CRON] Recordatorio ${reminder.id} sin contacto válido`);
            await AppointmentReminder.update(
              { status: 'failed', errorMessage: 'Contacto sin número de WhatsApp' },
              { where: { id: reminder.id } }
            );
            continue;
          }

          // Formatear mensaje de recordatorio usando la plantilla o mensaje por defecto
          const appointmentDate = new Date(appointment.startTime);
          const formattedDate = appointmentDate.toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
          const formattedTime = appointmentDate.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
          });

          // Obtener plantilla del appointment si existe
          const reminderTemplate = appointment.reminderTemplate;
          let reminderMessage: string;

          if (reminderTemplate) {
            // Usar mensaje de la plantilla con sustitución de variables
            // Determinar qué mensaje usar: messageReminder si está confirmada, messageConfirm si no
            const templateMessage = appointment.status === 'confirmed'
              ? (reminderTemplate.messageReminder || reminderTemplate.messageConfirm)
              : reminderTemplate.messageConfirm;

            reminderMessage = templateMessage
              .replace(/\{\{clientName\}\}/g, contact.name || '')
              .replace(/\{\{date\}\}/g, formattedDate)
              .replace(/\{\{time\}\}/g, formattedTime)
              .replace(/\{\{service\}\}/g, service?.name || 'Cita')
              .replace(/\{\{agent\}\}/g, appointment.assignedUser?.name || '');

            logger.info(`📋 [CRON] Usando plantilla "${reminderTemplate.name}" para recordatorio`);
          } else {
            // Mensaje por defecto si no hay plantilla
            reminderMessage = `🗓️ *Recordatorio de Cita*\n\n` +
              `Hola ${contact.name},\n\n` +
              `Te recordamos que tienes una cita programada:\n\n` +
              `📋 *Servicio:* ${service?.name || 'Cita'}\n` +
              `📅 *Fecha:* ${formattedDate}\n` +
              `⏰ *Hora:* ${formattedTime}\n\n` +
              `¡Te esperamos!`;

            logger.warn(`⚠️ [CRON] Cita ${appointment.id} sin plantilla de recordatorio, usando mensaje por defecto`);
          }

          // Buscar WhatsApp de la empresa
          const whatsapp = await Whatsapp.findOne({
            where: {
              companyId: reminder.companyId,
              status: 'CONNECTED'
            }
          });

          if (!whatsapp) {
            logger.warn(`⚠️ [CRON] No hay WhatsApp conectado para empresa ${reminder.companyId}`);
            await AppointmentReminder.update(
              { status: 'failed', errorMessage: 'No hay WhatsApp conectado' },
              { where: { id: reminder.id } }
            );
            continue;
          }

          // Obtener settings de la empresa para FindOrCreateTicketService
          const companySettings = await CompaniesSettings.findOne({
            where: { companyId: reminder.companyId }
          });
          const settings = companySettings || {};

          // Buscar o crear ticket para el contacto
          const ticket = await FindOrCreateTicketService(
            contact,
            whatsapp,
            0, // unreadMessages
            reminder.companyId,
            null, // queueId
            null, // userId
            undefined, // groupContact
            'whatsapp', // channel
            false, // isImported
            false, // isForward
            settings, // settings
            false, // isTransfered
            false // isCampaign
          );

          // Enviar mensaje por WhatsApp usando SendWhatsAppMessage que devuelve el mensaje enviado
          const sentMessage = await SendWhatsAppMessage({
            body: reminderMessage,
            ticket,
            quotedMsg: null
          });

          // Guardar mensaje en la base de datos
          const messageId = (sentMessage as any)?.id?.id || (sentMessage as any)?.key?.id || `reminder_${uuidv4()}`;
          await CreateMessageService({
            messageData: {
              wid: messageId,
              ticketId: ticket.id,
              body: reminderMessage,
              contactId: contact.id,
              fromMe: true,
              read: true,
              mediaType: 'chat',
              ack: 2,
              channel: 'whatsapp'
            },
            companyId: reminder.companyId
          });

          // Marcar como enviado
          await AppointmentReminder.update(
            { status: 'sent', sentAt: new Date() },
            { where: { id: reminder.id } }
          );

          logger.info(`✅ [CRON] Recordatorio enviado y guardado en ticket ${ticket.id} para ${contact.name} (${contact.number})`);

        } catch (reminderError: any) {
          Sentry.captureException(reminderError);
          logger.error(`❌ [CRON] Error enviando recordatorio ${reminder.id}: ${reminderError.message}`);

          await AppointmentReminder.update(
            { status: 'failed', errorMessage: reminderError.message },
            { where: { id: reminder.id } }
          );
        }
      }
    } catch (e: any) {
      Sentry.captureException(e);
      logger.error(`❌ [CRON] Error procesando recordatorios de citas: ${e.message}`);
    }
  });
  logger.info("✅ [CRON] handleAppointmentReminders iniciado (cada 1 min)");
}

// ============================================================
// CRONJOB 12: handleTikTokCommentPoll
// Polling de comentarios TikTok cada 5 minutos
// ============================================================
function handleTikTokCommentPoll() {
  cron.schedule("*/5 * * * *", async () => {
    try {
      const TikTokCommentPollerService = (await import("./services/TikTokService/TikTokCommentPollerService")).default;
      const result = await TikTokCommentPollerService();
      if (result.newComments > 0) {
        logger.info(
          `[TikTokPoll] ${result.newComments} comentarios nuevos de ${result.connectionsPolled} conexiones`
        );
      }
    } catch (e: any) {
      Sentry.captureException(e);
      logger.error(`[TikTokPoll] Error: ${e.message}`);
    }
  });
  logger.info("CronJob 12: handleTikTokCommentPoll iniciado (cada 5 min)");
}

// ============================================================
// CRONJOB 13: handleTikTokTokenRefresh
// Renueva access_token TikTok antes de expirar (cada hora)
// ============================================================
function handleTikTokTokenRefresh() {
  cron.schedule("0 * * * *", async () => {
    try {
      const TikTokTokenRefreshService = (await import("./services/TikTokService/TikTokTokenRefreshService")).default;
      const result = await TikTokTokenRefreshService();
      if (result.tokensRefreshed > 0) {
        logger.info(
          `[TikTokToken] ${result.tokensRefreshed} tokens renovados`
        );
      }
    } catch (e: any) {
      Sentry.captureException(e);
      logger.error(`[TikTokToken] Error: ${e.message}`);
    }
  });
  logger.info("CronJob 13: handleTikTokTokenRefresh iniciado (cada 1 hora)");
}

// ============================================================
// CRONJOB 14: handleRetryFailedMessages
// Reintenta enviar mensajes que fallaron (cada 5 minutos)
// ============================================================
function handleRetryFailedMessages() {
  cron.schedule("*/5 * * * *", async () => {
    try {
      // Procesar mensajes pendientes directamente en backend
      const ProcessPendingMessagesService = (await import("./services/MessageServices/ProcessPendingMessagesService")).default;
      const processed = await ProcessPendingMessagesService();

      if (processed > 0) {
        logger.info(`[RetryFailedMessages] Procesados ${processed} mensajes pendientes`);
      }
    } catch (e: any) {
      Sentry.captureException(e);
      logger.error(`[RetryFailedMessages] Error: ${e.message}`);
    }
  });
  logger.info("CronJob 14: handleRetryFailedMessages iniciado (cada 5 min)");
}

// ============================================================
// CRONJOB 15: handleDriveBackupMonthly
// Backup mensual de multimedia a Google Drive
// Se ejecuta el día 1 de cada mes a las 3:00 AM
// Respalda los archivos del mes ANTERIOR
// ============================================================
function handleDriveBackupMonthly() {
  // Se ejecuta el día 1 de cada mes a las 3:00 AM
  // Calcula mes anterior y respalda
  cron.schedule('0 3 1 * *', async () => {
    const now = new Date();
    // Calcular mes anterior
    let targetYear = now.getFullYear();
    let targetMonth = now.getMonth(); // 0=ene, 11=dic
    // Si es enero (month=0), el mes anterior es diciembre del año anterior
    if (targetMonth === 0) {
      targetMonth = 11;
      targetYear = targetYear - 1;
    } else {
      targetMonth = targetMonth - 1;
    }

    logger.info(`[DriveBackup] Iniciando backup mensual de ${targetYear}-${String(targetMonth + 1).padStart(2, '0')}...`);

    try {
      // Importación lazy para no bloquear el startup (default export = singleton instance)
      const service = (await import('./services/DriveBackupService')).default;
      const result = await service.backupAllCompanies(targetYear, targetMonth);

      logger.info(`[DriveBackup] Completado: ${result.successful}/${result.processed} companies con éxito, ${result.failed} fallos`);
    } catch (e: any) {
      Sentry.captureException(e);
      logger.error(`[DriveBackup] Error general: ${e.message}`);
    }
  });
  logger.info('CronJob 15: handleDriveBackupMonthly iniciado (día 1 de cada mes a las 3:00 AM)');
}

// ============================================================
// FUNCIÓN PRINCIPAL: Inicia todos los CronJobs
// ============================================================
export function startBackendCronJobs(): void {
  logger.info("🕐 [BACKEND] Iniciando CronJobs del backend...");

  handleCloseTicketsAutomatic();
  handleProcessLanes();
  handleRandomUser();
  handleVerifyQueue();
  handleInvoiceCreate();
  handleAppointmentReminders();
  handleTikTokCommentPoll();
  handleTikTokTokenRefresh();
  handleRetryFailedMessages();
  handleDriveBackupMonthly();

  logger.info("✅ [BACKEND] Todos los CronJobs iniciados (incluye TikTok + DriveBackup)");
}

// console.log("🕐🕐🕐 BACKEND-CRON-JOBS.TS FULLY LOADED! 🕐🕐🕐");
