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
import { Op, Sequelize } from "sequelize";
import lodash from "lodash";
const { isNil } = lodash;

import logger from "./utils/logger";
import ImportInsightsDailyService from "./services/MetaMarketingService/ImportInsightsDailyService"; // [Fase2·D5.1]
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
import ResolveAppointmentReminderWhatsapp from "./services/AppointmentServices/ResolveAppointmentReminderWhatsapp";
import { v4 as uuidv4 } from "uuid";

import KanbanMovementLog from "./models/KanbanMovementLog";
import Message from "./models/Message";
import { timeLaneToDate } from "./helpers/timeLane";
import { handleTagAssignment } from "./workers/stageClassifier.worker";

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

                try {
                  await handleTagAssignment(t.ticketId, nextTag.id, companyId);
                } catch (followupErr: any) {
                  logger.warn(
                    `[Kanban] No se pudo programar seguimiento tras auto-avance ` +
                    `ticket=${t.ticketId}, tag=${nextTag.id}: ${followupErr?.message || followupErr}`
                  );
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
// CRONJOB 5b: handleCompanyExpirationAlert
// Envía alertas WhatsApp al superadmin cuando una empresa:
//   - está a 4 días de expirar (warning)
//   - ya expiró (expired)
// Idempotente: usa Companies.expirationWarningSentAt y .expirationNotifiedAt
// para evitar reenvíos. Se resetean cuando dueDate se renueva.
// ============================================================
/**
 * `where` para "empresas activas" — SIN comparar contra un booleano.
 *
 * ## El bug que arregla (encontrado en el triaje de logs, 2026-07-30)
 *
 * Tres cron jobs hacían `Company.findAll({ where: { status: true } })` y los tres
 * llevaban fallando **cada noche** con:
 *
 *     operator does not exist: character varying = boolean
 *
 * Causa: **drift entre el modelo y el esquema.** `models/Company.ts` declara
 * `@Column(DataType.BOOLEAN) status: boolean`, pero la columna real en Postgres es
 * `character varying`. Sequelize generaba `WHERE "status" = true` y Postgres lo
 * rechaza — la query entera lanza, así que el job no procesaba NADA. No era una
 * empresa que fallaba: era el job completo caído.
 *
 * En dos de los tres sitios había un `as any` que es justo lo que impidió que
 * TypeScript avisara.
 *
 * ## Por qué dos valores
 *
 * En producción la columna tenía `'true'` (16 filas) y `'active'` (1): dos
 * convenciones conviviendo. Se aceptan las dos.
 *
 * ## Por qué compara sobre un CAST y no directamente
 *
 * `CAST(status AS text) IN ('true','active')` funciona con la columna en TEXTO y
 * también con la columna ya migrada a BOOLEAN (donde el cast devuelve
 * `'true'`/`'false'`).
 *
 * Eso quita una trampa de orden real: la migración
 * `20260730000001-companies-status-to-boolean` se aplica a mano por SQL y el
 * despliegue es un `pm2 restart` aparte. Con un predicado que solo valiera para
 * una de las dos formas, hacerlo en el orden equivocado volvería a tumbar los
 * tres cron — y el que lo hiciera no tendría por qué saberlo.
 *
 * Cuando la migración esté aplicada y verificada, esto puede simplificarse a
 * `{ status: true }`.
 */
const WHERE_COMPANY_ACTIVE = Sequelize.where(
  Sequelize.cast(Sequelize.col("status"), "text"),
  { [Op.in]: ["true", "active"] }
) as any;

function handleCompanyExpirationAlert() {
  cron.schedule('0 9 * * *', async () => {
    try {
      const NotifyCompanyExpirationService = (
        await import("./services/CompanyService/NotifyCompanyExpirationService")
      ).default;

      const companies = await Company.findAll({
        where: WHERE_COMPANY_ACTIVE
      });

      const today = moment().startOf('day');
      let warnings = 0;
      let expirations = 0;

      for (const c of companies) {
        try {
          if (!c.dueDate) continue;

          const dueDate = moment(c.dueDate).startOf('day');
          if (!dueDate.isValid()) continue;

          const daysUntilDue = dueDate.diff(today, 'days');
          const daysAfterDue = today.diff(dueDate, 'days');

          // Resetear flags si dueDate fue renovado (es posterior al último envío)
          if (
            c.expirationWarningSentAt &&
            moment(c.dueDate).isAfter(moment(c.expirationWarningSentAt))
          ) {
            await c.update({
              expirationWarningSentAt: null,
              expirationNotifiedAt: null
            });
            // Recargar valores en memoria
            (c as any).expirationWarningSentAt = null;
            (c as any).expirationNotifiedAt = null;
          }

          // 1. Warning a 4 días del vencimiento
          if (daysUntilDue === 4 && !c.expirationWarningSentAt) {
            const result = await NotifyCompanyExpirationService(
              {
                id: c.id,
                name: c.name,
                email: c.email,
                phone: c.phone,
                document: c.document,
                planId: c.planId,
                dueDate: c.dueDate,
                recurrence: c.recurrence,
                daysUntilDue: 4
              },
              "warning"
            );
            if (result.sent > 0) {
              await c.update({ expirationWarningSentAt: new Date() });
              warnings++;
            }
          }

          // 2. Expired cuando ya pasó el vencimiento
          if (daysAfterDue >= 0 && !c.expirationNotifiedAt) {
            const result = await NotifyCompanyExpirationService(
              {
                id: c.id,
                name: c.name,
                email: c.email,
                phone: c.phone,
                document: c.document,
                planId: c.planId,
                dueDate: c.dueDate,
                recurrence: c.recurrence,
                daysAfterDue
              },
              "expired"
            );
            if (result.sent > 0) {
              await c.update({ expirationNotifiedAt: new Date() });
              expirations++;
            }
          }
        } catch (innerErr: any) {
          Sentry.captureException(innerErr);
          logger.error(
            `[CompanyExpirationAlert] Empresa ${c.id}: error - ${innerErr.message}`
          );
        }
      }

      if (warnings > 0 || expirations > 0) {
        logger.info(
          `[CompanyExpirationAlert] ${warnings} avisos previos + ${expirations} avisos de expiración procesados`
        );
      }
    } catch (e: any) {
      Sentry.captureException(e);
      logger.error(`[CompanyExpirationAlert] Error general: ${e.message}`);
    }
  });
  logger.info("✅ [CRON] handleCompanyExpirationAlert iniciado (diario 9 AM)");
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

          // Resolver la conexión correcta: primero la del ticket de la cita,
          // luego la del contacto, y solo como último recurso una conectada
          // de la empresa. Así evitamos enviar recordatorios por otro número.
          const whatsappResult = await ResolveAppointmentReminderWhatsapp({
            appointment,
            contact,
            companyId: reminder.companyId,
            logPrefix: "CRON-APPT-REMINDER"
          });
          const whatsapp = whatsappResult.whatsapp;

          if (!whatsapp) {
            logger.warn(
              `⚠️ [CRON] No se puede enviar recordatorio ${reminder.id}: ` +
              `${whatsappResult.reason || "No hay WhatsApp conectado"}`
            );
            await AppointmentReminder.update(
              { status: 'failed', errorMessage: whatsappResult.reason || 'No hay WhatsApp conectado' },
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

          // Enviar por el guard coexistence-aware: si el ticket está en
          // coexistencia, rutea por el router central (un solo intento lógico
          // + fallback Meta↔Baileys); si no, legacy SendWhatsAppMessage.
          const { sendTicketText } = await import(
            "./services/CoexistenceServices/CoexistenceAwareTextSender"
          );
          const sendRes = await sendTicketText({
            ticket,
            body: reminderMessage,
            companyId: reminder.companyId,
            requestedBy: "cron",
            quotedMsg: null
          });

          // Persistir el Message manualmente SOLO si el router central NO lo
          // hizo ya (viaRouter=false → legacy Baileys, que no auto-persiste).
          if (!sendRes.viaRouter) {
            const messageId = sendRes.providerMessageId || `reminder_${uuidv4()}`;
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
          }

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
// CRONJOB 15: handleMediaBackupMonthly
// Backup mensual de multimedia de tickets por Listmonk
// Se ejecuta el día 1 de cada mes a las 03:00
// Política: conservar los últimos 30 días (env MEDIA_BACKUP_RETENTION_DAYS),
// comprimir todo lo más viejo (acumulado, no sólo "mes anterior"), enviar
// por Listmonk al correo de la company y borrar originales validados.
// ============================================================
function handleMediaBackupMonthly() {
  cron.schedule('0 3 1 * *', async () => {
    const retentionDays = parseInt(process.env.MEDIA_BACKUP_RETENTION_DAYS || '30', 10);
    logger.info(`[MediaBackup] Iniciando backup mensual (retención=${retentionDays}d)...`);

    try {
      const service = (await import('./services/MediaBackupService')).default;
      const stats = await service.backupAllCompanies({ retentionDays });

      logger.info(
        `[MediaBackup] Completado: ${stats.successful}/${stats.processed} OK | ` +
        `${stats.failed} fallos | ${stats.skipped} skipped(lock) | ` +
        `${(stats.totalBytesFreed / (1024 * 1024)).toFixed(2)} MB liberados`
      );
    } catch (e: any) {
      Sentry.captureException(e);
      logger.error(`[MediaBackup] Error general: ${e.message}`);
    }
  });
  logger.info('CronJob 15: handleMediaBackupMonthly iniciado (día 1 cada mes a las 03:00)');
}

// ============================================================
// CRONJOB 16: handleTicketFollowups
// PRIMERA OLA — Feature 2: Seguimientos automáticos de tickets
// Cada 30 minutos: busca tickets con nextFollowupAt vencido y envía
// mensaje IA contextual por el canal del ticket. Multi-tenant nativo.
// ============================================================
function handleTicketFollowups() {
  cron.schedule('*/30 * * * *', async () => {
    try {
      const TicketFollowupService = (
        await import('./services/AIAgentServices/TicketFollowupService')
      ).default;

      const result = await TicketFollowupService.runDueFollowups();
      if (result.processed > 0) {
        logger.info(
          `[CRON-16] Followups: ${result.sent} enviados, ` +
            `${result.closed} cerrados, ${result.errors} errores`
        );
      }
    } catch (e: any) {
      Sentry.captureException(e);
      logger.error(`[CRON-16] handleTicketFollowups error: ${e.message}`);
    }
  });
  logger.info("✅ [CRON] CronJob 16: handleTicketFollowups iniciado (cada 30 min)");
}

// ============================================================
// FUNCIÓN PRINCIPAL: Inicia todos los CronJobs
// ============================================================
// ============================================================
// [Fase2·D5.1] CRON: importa insights de Meta a InsightsDaily (cada hora)
// Alimenta el ROAS/CPA reales (E4.1). Fail-safe internamente.
// ============================================================
function handleImportInsightsDaily() {
  cron.schedule('0 * * * *', async () => {
    try {
      const r = await ImportInsightsDailyService();
      logger.info(`✅ [CRON] ImportInsightsDaily: ${r.companies} companies, ${r.campaigns} campañas, ${r.errors} errores`);
    } catch (e: any) {
      Sentry.captureException(e);
      logger.error(`[CRON] ImportInsightsDaily error: ${e.message}`);
    }
  });
  logger.info("✅ [CRON] handleImportInsightsDaily iniciado (cada hora)");
}

/**
 * [Fase2·Ola D · G0] Motor estadístico nocturno (03:30). Corre los análisis por
 * empresa y persiste las recomendaciones en recommendation_runs para el panel y
 * la medición de acierto. Aislado por empresa: un fallo no corta a las demás.
 */
/**
 * [Fase2·Ola F · F1.1] Motor de calendario mensual (diario 08:00, ramifica por getDate()).
 *  d20: abre el paquete del mes siguiente (draft) listo para cargar piezas.
 *  d25: recuerda los paquetes enviados aún sin aprobar (deadline 48h).
 *  d28-30: recuerda programar lo aprobado.
 * El corte de datos (d15) y la apertura de producción los consume el resto de la ola.
 */
function handleMonthlyCalendar(): void {
  cron.schedule('0 8 * * *', async () => {
    const day = new Date().getUTCDate();
    if (![20, 25, 28, 29, 30].includes(day)) return;
    try {
      const { getOrCreatePackage, currentPeriod } = await import("./services/CampaignApprovalService");
      const CampaignApproval = (await import("./models/CampaignApproval")).default;
      const companies = await Company.findAll({ where: WHERE_COMPANY_ACTIVE });
      for (const c of companies) {
        try {
          if (day === 20) {
            // Abrir el paquete del MES SIGUIENTE.
            const now = new Date();
            const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
            await getOrCreatePackage(c.id, `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`);
          } else if (day === 25) {
            const pkg = await CampaignApproval.findOne({ where: { companyId: c.id, period: currentPeriod(), status: "submitted" } as any });
            if (pkg) logger.warn(`[calendar] d25: paquete ${pkg.id} (company ${c.id}) enviado sin aprobar, deadline ${pkg.deadlineAt}`);
          }
        } catch (err: any) {
          logger.error(`[calendar] company ${c.id} día ${day} falló: ${err?.message || err}`);
        }
      }
      logger.info(`[calendar] día ${day} procesado para ${companies.length} empresas`);
    } catch (err: any) {
      logger.error(`[calendar] error global: ${err?.message || err}`);
    }
  });
}

function handleStatsNightly(): void {
  cron.schedule('30 3 * * *', async () => {
    logger.info("📊 [stats.nightly] Iniciando motor estadístico...");
    try {
      const { runStatsForCompany } = await import("./services/StatsRecommendationService");
      const companies = await Company.findAll({ where: WHERE_COMPANY_ACTIVE });
      let total = 0;
      for (const c of companies) {
        try {
          const { recorded } = await runStatsForCompany(c.id);
          total += recorded;
        } catch (err: any) {
          logger.error(`[stats.nightly] company ${c.id} falló: ${err?.message || err}`);
        }
      }
      logger.info(`📊 [stats.nightly] Completado: ${total} recomendaciones en ${companies.length} empresas`);
    } catch (err: any) {
      logger.error(`[stats.nightly] error global: ${err?.message || err}`);
    }
  });
}

export function startBackendCronJobs(): void {
  logger.info("🕐 [BACKEND] Iniciando CronJobs del backend...");

  handleCloseTicketsAutomatic();
  handleProcessLanes();
  handleImportInsightsDaily(); // [Fase2·D5.1]
  handleRandomUser();
  handleVerifyQueue();
  handleInvoiceCreate();
  handleCompanyExpirationAlert();
  handleAppointmentReminders();
  handleTikTokCommentPoll();
  handleTikTokTokenRefresh();
  handleRetryFailedMessages();
  handleMediaBackupMonthly();
  handleStatsNightly(); // [Fase2·Ola D · G0]
  handleMonthlyCalendar(); // [Fase2·Ola F · F1.1]
  // NOTA (2026-05-08): handleTicketFollowups DESACTIVADO.
  // Razón: el sistema dinámico por etiqueta Kanban (workers/stageClassifier.worker.ts)
  // ya cumple esta función con configuración por company (followupMessage1/2/3,
  // followupDelay1/2/3, aiGuidance1/2/3 en tabla Tags).
  // El CronJob 16 quedaría como fallback opcional — activar SOLO si quisieras un
  // seguimiento global para tickets sin etiqueta Kanban asignada.
  // handleTicketFollowups();

  logger.info("✅ [BACKEND] Todos los CronJobs iniciados (incluye TikTok + DriveBackup)");
}

// console.log("🕐🕐🕐 BACKEND-CRON-JOBS.TS FULLY LOADED! 🕐🕐🕐");
