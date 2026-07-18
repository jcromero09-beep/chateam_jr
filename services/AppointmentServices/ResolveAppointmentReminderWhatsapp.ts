import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";

type AppointmentLike = {
  id?: number | null;
  ticketId?: number | null;
};

type ContactLike = {
  id?: number | null;
  whatsappId?: number | null;
};

export type AppointmentReminderWhatsappSource =
  | "ticket"
  | "contact"
  | "company_fallback"
  | "none";

export interface ResolveAppointmentReminderWhatsappResult {
  whatsapp: Whatsapp | null;
  source: AppointmentReminderWhatsappSource;
  reason?: string;
}

const toPositiveNumber = (value: any): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const findConnectedWhatsapp = async (
  whatsappId: number,
  companyId: number
): Promise<Whatsapp | null> => {
  return Whatsapp.findOne({
    where: {
      id: whatsappId,
      companyId,
      status: "CONNECTED"
    }
  });
};

export default async function ResolveAppointmentReminderWhatsapp({
  appointment,
  contact,
  companyId,
  logPrefix = "AppointmentReminder"
}: {
  appointment: AppointmentLike;
  contact?: ContactLike | null;
  companyId: number;
  logPrefix?: string;
}): Promise<ResolveAppointmentReminderWhatsappResult> {
  const appointmentId = appointment?.id || "unknown";
  const ticketId = toPositiveNumber(appointment?.ticketId);

  if (ticketId) {
    const ticket = await Ticket.findOne({
      where: { id: ticketId, companyId },
      attributes: ["id", "whatsappId"]
    });

    const ticketWhatsappId = toPositiveNumber(ticket?.whatsappId);

    if (ticketWhatsappId) {
      const whatsapp = await findConnectedWhatsapp(ticketWhatsappId, companyId);

      if (whatsapp) {
        logger.info(
          `[${logPrefix}] Usando conexión original del ticket para cita ${appointmentId}: ` +
          `ticketId=${ticketId}, whatsappId=${whatsapp.id}`
        );
        return { whatsapp, source: "ticket" };
      }

      return {
        whatsapp: null,
        source: "ticket",
        reason:
          `La conexión original del ticket ${ticketId} ` +
          `(whatsappId=${ticketWhatsappId}) no está CONNECTED`
      };
    }

    logger.warn(
      `[${logPrefix}] La cita ${appointmentId} tiene ticketId=${ticketId}, ` +
      `pero el ticket no existe o no tiene whatsappId`
    );
  }

  const contactWhatsappId = toPositiveNumber(contact?.whatsappId);

  if (contactWhatsappId) {
    const whatsapp = await findConnectedWhatsapp(contactWhatsappId, companyId);

    if (whatsapp) {
      logger.info(
        `[${logPrefix}] Usando conexión asociada al contacto para cita ${appointmentId}: ` +
        `contactId=${contact?.id || "unknown"}, whatsappId=${whatsapp.id}`
      );
      return { whatsapp, source: "contact" };
    }

    return {
      whatsapp: null,
      source: "contact",
      reason:
        `La conexión asociada al contacto ${contact?.id || "unknown"} ` +
        `(whatsappId=${contactWhatsappId}) no está CONNECTED`
    };
  }

  const fallbackWhatsapp = await Whatsapp.findOne({
    where: {
      companyId,
      status: "CONNECTED"
    }
  });

  if (fallbackWhatsapp) {
    logger.warn(
      `[${logPrefix}] Cita ${appointmentId} sin ticketId/contact.whatsappId; ` +
      `usando fallback de empresa whatsappId=${fallbackWhatsapp.id}`
    );
    return { whatsapp: fallbackWhatsapp, source: "company_fallback" };
  }

  return {
    whatsapp: null,
    source: "none",
    reason: `No hay WhatsApp CONNECTED para empresa ${companyId}`
  };
}
