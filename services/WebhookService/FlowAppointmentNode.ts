/**
 * FlowAppointmentNode
 * --------------------
 * Sub-máquina de estados del nodo "citas" del FlowBuilder conversacional.
 * Guía al cliente por WhatsApp con selección por NÚMEROS para agendar una cita,
 * reutilizando la lógica de citas existente (servicios, disponibilidad, booking).
 *
 * El motor (ActionsWebhookService) solo delega aquí y hace `break`: este módulo
 * gestiona el envío de mensajes y el estado de pausa/fin en el propio Ticket
 * (dataWebhook.citas + flowWebhook/lastFlowId). NO ramifica a otros nodos: el
 * nodo es TERMINAL (agenda o cancela y el flujo termina). — Fase 1.
 */
import Ticket from "../../models/Ticket.js";
import logger from "../../utils/logger.js";
import { Op } from "sequelize";
import User from "../../models/User.js";
import AppointmentAvailability from "../../models/Appointments/AppointmentAvailability.js";
import ShowTicketService from "../TicketServices/ShowTicketService.js";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage.js";
import { typeSimulation } from "../WbotServices/SendWhatsAppMediaFlow.js";
import formatBodyFlow from "../../helpers/FlowVariables.js";
import SetTicketMessagesAsRead from "../../helpers/SetTicketMessagesAsRead.js";
import AppointmentServiceCRUD from "../AppointmentServices/AppointmentServiceCRUD.js";
import AvailabilityService from "../AppointmentServices/AvailabilityService.js";
import BookingService from "../AppointmentServices/BookingService.js";

const DEFAULT_TZ = "America/Lima";
const DEFAULT_SLOTS_LIMIT = 8;
const DEFAULT_DAYS_AHEAD = 14;

interface HandleParams {
  ticket: any;
  companyId: number;
  whatsappId: number;
  nodeSelected: any;
  pressKey?: string;
  dataWebhook: any;
  numberPhrase: any;
  idFlowDb: number;
  hashWebhookId: string;
}

// ─── Helpers de datos (reutilizan servicios/patrones existentes) ────────────────

/** Profesionales con disponibilidad configurada para un servicio (patrón ToolRegistry). */
async function getServiceProviders(
  companyId: number,
  serviceId: number
): Promise<{ id: number; name: string }[]> {
  const specific = await AppointmentAvailability.findAll({
    where: { companyId, serviceId, isAvailable: true },
    attributes: ["userId"],
    order: [["userId", "ASC"]]
  });

  const rows =
    specific.length > 0
      ? specific
      : await AppointmentAvailability.findAll({
          where: { companyId, serviceId: { [Op.is]: null }, isAvailable: true },
          attributes: ["userId"],
          order: [["userId", "ASC"]]
        });

  const userIds = Array.from(
    new Set(
      rows
        .map((r: any) => Number(r.userId))
        .filter((id: number) => Number.isFinite(id) && id > 0)
    )
  );
  if (userIds.length === 0) return [];

  const users = await User.findAll({
    where: { companyId, id: { [Op.in]: userIds } },
    attributes: ["id", "name"],
    order: [["name", "ASC"]]
  });
  return users.map((u: any) => ({ id: u.id, name: u.name }));
}

/** Próximos huecos libres (usuario+servicio), iterando día a día hasta juntar `limit`. */
async function getUpcomingSlots(
  companyId: number,
  serviceId: number,
  userId: number,
  daysAhead: number,
  limit: number,
  tz: string
): Promise<{ start: string; end: string; label: string }[]> {
  const out: { start: string; end: string; label: string }[] = [];
  const now = new Date();

  for (let d = 0; d < daysAhead && out.length < limit; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() + d);
    const startDate = new Date(day);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(day);
    endDate.setHours(23, 59, 59, 999);

    let slots: any[] = [];
    try {
      slots = await AvailabilityService.getAvailableSlots({
        companyId,
        serviceId,
        userId,
        startDate,
        endDate
      });
    } catch (e: any) {
      logger.warn(`[FlowCitas] getAvailableSlots falló día ${d}: ${e?.message || e}`);
      continue;
    }

    for (const s of slots) {
      if (!s?.available) continue;
      const start = new Date(s.start);
      if (start.getTime() <= now.getTime()) continue; // descarta pasado
      out.push({
        start: start.toISOString(),
        end: new Date(s.end).toISOString(),
        label: formatSlotLabel(start, tz)
      });
      if (out.length >= limit) break;
    }
  }
  return out;
}

function formatSlotLabel(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz
    }).format(date);
  } catch {
    return date.toLocaleString("es-ES");
  }
}

const numberedList = (items: { name?: string; label?: string }[]): string =>
  items.map((it, i) => `*[${i + 1}]* ${it.name ?? it.label}`).join("\n");

// ─── Envío / estado (replica el patrón del nodo menú del motor) ─────────────────

async function sendFlowText(
  ticket: any,
  companyId: number,
  body: string,
  numberPhrase: any
): Promise<void> {
  const ticketDetails = await ShowTicketService(ticket.id, companyId);
  await typeSimulation(ticket, "composing");
  const rendered = formatBodyFlow(body, ticketDetails as any, numberPhrase);
  await SendWhatsAppMessage({ body: rendered, ticket: ticketDetails, quotedMsg: null });
  SetTicketMessagesAsRead(ticketDetails);
  await ticketDetails.update({ lastMessage: rendered });
}

/** Envía un mensaje y deja el ticket PAUSADO esperando la respuesta numérica. */
async function sendAndPause(
  p: HandleParams,
  body: string,
  nextCitasState: any
): Promise<void> {
  await sendFlowText(p.ticket, p.companyId, body, p.numberPhrase);
  const fresh = await Ticket.findOne({
    where: { id: p.ticket.id, whatsappId: Number(p.whatsappId) || undefined, companyId: p.companyId }
  });
  if (fresh) {
    const nextData = { ...(p.dataWebhook || {}), citas: nextCitasState };
    await fresh.update({
      flowWebhook: true,
      lastFlowId: p.nodeSelected.id,
      dataWebhook: nextData,
      hashFlowId: p.hashWebhookId,
      flowStopped: p.idFlowDb.toString()
    });
  }
}

/** Envía un mensaje final y SACA el ticket del flujo (nodo terminal: agendó/canceló). */
async function sendAndEnd(p: HandleParams, body: string): Promise<void> {
  await sendFlowText(p.ticket, p.companyId, body, p.numberPhrase);
  const fresh = await Ticket.findOne({
    where: { id: p.ticket.id, whatsappId: Number(p.whatsappId) || undefined, companyId: p.companyId }
  });
  if (fresh) {
    const nextData = { ...(p.dataWebhook || {}), citas: null };
    await fresh.update({
      flowWebhook: false,
      lastFlowId: null,
      hashFlowId: null,
      dataWebhook: nextData,
      flowStopped: p.idFlowDb.toString()
    });
  }
}

// ─── Sub-máquina ────────────────────────────────────────────────────────────────

export default async function handleFlowAppointmentNode(p: HandleParams): Promise<void> {
  const cfg = p.nodeSelected?.data || {};
  const tz = cfg.timezone || DEFAULT_TZ;
  const slotsLimit = Number(cfg.slotsLimit) > 0 ? Number(cfg.slotsLimit) : DEFAULT_SLOTS_LIMIT;
  const daysAhead = Number(cfg.daysAhead) > 0 ? Number(cfg.daysAhead) : DEFAULT_DAYS_AHEAD;
  const state = (p.dataWebhook && p.dataWebhook.citas) || {};

  try {
    // ── INICIO: primera vez que el flujo entra al nodo (sin respuesta previa) ──
    if (!p.pressKey || !state.step) {
      const services = await AppointmentServiceCRUD.listByCompany(p.companyId, true);
      if (!services.length) {
        await sendAndEnd(p, cfg.noServicesMessage || "Por el momento no hay servicios disponibles para agendar. 🙏");
        return;
      }
      const svc = services.map((s: any) => ({ id: s.id, name: s.name }));
      const body =
        `${cfg.welcomeMessage ? cfg.welcomeMessage + "\n\n" : ""}` +
        `${cfg.servicePrompt || "¿Qué servicio deseas agendar? 📋"}\n\n${numberedList(svc)}`;
      await sendAndPause(p, body, { step: "service", services: svc });
      return;
    }

    const choice = parseInt(String(p.pressKey).trim(), 10);
    const invalid = cfg.invalidMessage || "Opción no válida. Por favor responde con el *número* de la lista. 🔢";

    // ── PASO service → user ──
    if (state.step === "service") {
      const services = state.services || [];
      if (!(choice >= 1 && choice <= services.length)) {
        await sendAndPause(p, invalid, state);
        return;
      }
      const svc = services[choice - 1];
      const providers = await getServiceProviders(p.companyId, svc.id);
      if (!providers.length) {
        await sendAndEnd(p, cfg.noProvidersMessage || "No hay profesionales disponibles para ese servicio. Un asesor te contactará. 🙌");
        return;
      }
      const body = `${cfg.userPrompt || "¿Con quién deseas la cita? 👤"}\n\n${numberedList(providers)}`;
      await sendAndPause(p, body, { step: "user", serviceId: svc.id, serviceName: svc.name, providers });
      return;
    }

    // ── PASO user → slot ──
    if (state.step === "user") {
      const providers = state.providers || [];
      if (!(choice >= 1 && choice <= providers.length)) {
        await sendAndPause(p, invalid, state);
        return;
      }
      const prov = providers[choice - 1];
      const slots = await getUpcomingSlots(p.companyId, state.serviceId, prov.id, daysAhead, slotsLimit, tz);
      if (!slots.length) {
        await sendAndEnd(p, cfg.noSlotsMessage || "No hay horarios disponibles próximamente. Intenta más adelante. 📅");
        return;
      }
      const body = `${cfg.slotPrompt || "Elige un horario disponible: 🕐"}\n\n${numberedList(slots)}`;
      await sendAndPause(p, body, {
        step: "slot",
        serviceId: state.serviceId,
        serviceName: state.serviceName,
        userId: prov.id,
        userName: prov.name,
        slots
      });
      return;
    }

    // ── PASO slot → confirm ──
    if (state.step === "slot") {
      const slots = state.slots || [];
      if (!(choice >= 1 && choice <= slots.length)) {
        await sendAndPause(p, invalid, state);
        return;
      }
      const slot = slots[choice - 1];
      const summary =
        `📋 *Confirma tu cita:*\n\n` +
        `📌 Servicio: ${state.serviceName}\n` +
        `👤 Profesional: ${state.userName}\n` +
        `📅 ${slot.label}\n\n` +
        `*[1]* ✅ Confirmar\n*[2]* ❌ Cancelar`;
      const body = cfg.confirmPrompt ? `${cfg.confirmPrompt}\n\n${summary}` : summary;
      await sendAndPause(p, body, {
        ...state,
        step: "confirm",
        selectedStart: slot.start,
        selectedEnd: slot.end,
        selectedLabel: slot.label
      });
      return;
    }

    // ── PASO confirm → crear / cancelar ──
    if (state.step === "confirm") {
      if (choice === 1) {
        try {
          await BookingService.createBooking({
            companyId: p.companyId,
            serviceId: state.serviceId,
            userId: state.userId,
            contactId: p.ticket.contactId,
            ticketId: p.ticket.id, // ← conexión correcta (fix de conexión de citas)
            startTime: new Date(state.selectedStart),
            title: "",
            notes: ""
          });
          await sendAndEnd(
            p,
            cfg.successMessage ||
              `✅ ¡Tu cita quedó agendada para *${state.selectedLabel}*! Te enviaremos un recordatorio. 🎉`
          );
        } catch (e: any) {
          logger.error(`[FlowCitas] Error creando cita ticket=${p.ticket.id}: ${e?.message || e}`);
          await sendAndEnd(p, cfg.errorMessage || "Ocurrió un problema al agendar tu cita. Un asesor te contactará en breve. 🙏");
        }
        return;
      }
      if (choice === 2) {
        await sendAndEnd(p, cfg.cancelMessage || "Entendido, no se agendó ninguna cita. Escríbenos cuando gustes. 👋");
        return;
      }
      await sendAndPause(p, cfg.confirmInvalidMessage || "Responde *1* para confirmar o *2* para cancelar.", state);
      return;
    }

    // Estado desconocido → reiniciar de forma segura
    logger.warn(`[FlowCitas] step desconocido="${state.step}" ticket=${p.ticket.id}; reiniciando nodo`);
    await sendAndEnd(p, "Reiniciemos el agendamiento. Escribe de nuevo para comenzar. 🔄");
  } catch (error: any) {
    logger.error(`[FlowCitas] Error inesperado ticket=${p.ticket?.id}: ${error?.message || error}`);
    try {
      await sendAndEnd(p, "Ocurrió un error con el agendamiento. Un asesor te ayudará. 🙏");
    } catch { /* noop */ }
  }
}
