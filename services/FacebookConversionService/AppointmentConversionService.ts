import Appointment from "../../models/Appointments/Appointment";
import AppointmentService from "../../models/AppointmentService";
import Ticket from "../../models/Ticket";
import logger from "../../utils/logger";
import SendConversionEvent from "./SendConversionEvent";
import { shouldSendMetaConversion } from "./MetaConversionPolicyService";

const PREFIX = "[AppointmentConversion]";

type DispatchResult = { ok: boolean; reason?: string };

/**
 * [Fase2·B1.1] Emite `Schedule` a Meta CAPI cuando se reserva una cita.
 *
 * El event_id es determinista (`appointment-{id}-schedule`) para que un reintento
 * o un doble guardado se deduplique en Meta en vez de contar dos citas.
 */
export const dispatchAppointmentConversion = async (
  appointmentId: number
): Promise<DispatchResult> => {
  let appointment: Appointment | null;
  try {
    appointment = await Appointment.findByPk(appointmentId, {
      include: [{ model: AppointmentService, as: "service", required: false }]
    });
  } catch (err: any) {
    logger.error(`${PREFIX} error consultando cita ${appointmentId}: ${err?.message || err}`);
    return { ok: false, reason: "appointment_query_error" };
  }

  if (!appointment) return { ok: false, reason: "appointment_not_found" };

  const { companyId, contactId, ticketId } = appointment;
  if (!companyId) return { ok: false, reason: "missing_company" };
  // Sin contacto no hay user_data que hashear => Meta descartaria el evento.
  if (!contactId) return { ok: false, reason: "missing_contact" };

  const policy = await shouldSendMetaConversion({
    companyId,
    eventKey: "appointment_booked"
  });
  if (!policy.enabled) {
    logger.info(`${PREFIX} skip policy_disabled company=${companyId} appointment=${appointmentId}`);
    return { ok: true, reason: "policy_disabled" };
  }

  // La conexion sale del ticket: es la que determina el dataset y el ctwa_clid.
  // Una cita creada desde el panel (sin ticket) no tiene canal atribuible.
  if (!ticketId) return { ok: false, reason: "missing_ticket" };

  let ticket: Ticket | null;
  try {
    ticket = await Ticket.findOne({ where: { id: ticketId, companyId } });
  } catch (err: any) {
    logger.error(`${PREFIX} error consultando ticket ${ticketId}: ${err?.message || err}`);
    return { ok: false, reason: "ticket_query_error" };
  }
  if (!ticket?.whatsappId) return { ok: false, reason: "missing_connection" };

  const service = (appointment as any).service as AppointmentService | undefined;
  const price = Number(service?.price);
  const hasValue = Number.isFinite(price) && price > 0;

  try {
    await SendConversionEvent({
      companyId,
      whatsappId: ticket.whatsappId,
      contactId,
      eventName: "Schedule",
      eventId: `appointment-${appointment.id}-schedule`,
      customData: {
        conversion_name: policy.conversionName,
        appointment_id: appointment.id,
        service_name: service?.name || appointment.title || undefined,
        ...(hasValue ? { value: price, currency: service?.currency || "USD" } : {})
      }
    });
  } catch (err: any) {
    logger.error(
      `${PREFIX} error enviando Schedule appointment=${appointmentId}: ${err?.message || err}`
    );
    return { ok: false, reason: "send_error" };
  }

  logger.info(
    `${PREFIX} Schedule enviado company=${companyId} appointment=${appointmentId} ` +
    `value=${hasValue ? price : "n/a"}`
  );
  return { ok: true };
};

/** Fire-and-forget: reservar la cita nunca puede fallar por un problema de CAPI. */
export const dispatchAppointmentConversionAsync = (appointmentId: number): void => {
  void dispatchAppointmentConversion(appointmentId).catch(err => {
    logger.error(`${PREFIX} fallo no capturado appointment=${appointmentId}: ${err?.message || err}`);
  });
};

export default { dispatchAppointmentConversion, dispatchAppointmentConversionAsync };
