import * as Yup from "yup";

import AppError from "../../errors/AppError";
import Schedule from "../../models/Schedule";
import ShowService from "./ShowService";
import resolveScheduleTicketId from "./resolveScheduleTicketId";

interface ScheduleData {
  id?: number;
  body?: string;
  sendAt?: string;
  sentAt?: string;
  contactId?: number;
  companyId?: number;
  ticketId?: number;
  userId?: number;
  ticketUserId?: number | string;
  queueId?: number | string;
  openTicket?: string;
  statusTicket?: string;
  whatsappId?: number | string;
  intervalo?: number;
  valorIntervalo?: number;
  enviarQuantasVezes?: number;
  tipoDias?: number;
  assinar?: boolean;
}

interface Request {
  scheduleData: ScheduleData;
  id: string | number;
  companyId: number;
}

const UpdateUserService = async ({
  scheduleData,
  id,
  companyId
}: Request): Promise<Schedule | undefined> => {
  const schedule = await ShowService(id, companyId);

  if (schedule?.companyId !== companyId) {
    throw new AppError("Não é possível alterar registros de outra empresa");
  }

  const schema = Yup.object().shape({
    body: Yup.string().min(5)
  });

  const {
    body,
    sendAt,
    sentAt,
    contactId,
    ticketId,
    userId,
    ticketUserId,
    queueId,
    openTicket,
    statusTicket,
    whatsappId,
    intervalo,
    valorIntervalo,
    enviarQuantasVezes,
    tipoDias,
    assinar
  } = scheduleData;

  try {
    await schema.validate({ body });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const parsedSendAt = sendAt ? new Date(sendAt) : undefined;

  if (sendAt && Number.isNaN(parsedSendAt?.getTime())) {
    throw new AppError("Fecha de envío inválida");
  }

  if (parsedSendAt && parsedSendAt.getTime() <= Date.now()) {
    throw new AppError("La fecha debe ser futura");
  }

  const shouldResolveTicketId =
    ticketId !== undefined ||
    contactId !== undefined ||
    whatsappId !== undefined ||
    !schedule.ticketId;

  const resolvedTicketId = shouldResolveTicketId
    ? await resolveScheduleTicketId({
        companyId,
        contactId: contactId ?? schedule.contactId,
        ticketId,
        userId: userId ?? schedule.userId,
        queueId: queueId ?? schedule.queueId,
        whatsappId: whatsappId ?? schedule.whatsappId,
        statusTicket: statusTicket ?? schedule.statusTicket
      })
    : schedule.ticketId;

  const buildUpdatePayload = (finalTicketId?: number) => ({
    body,
    sendAt: parsedSendAt,
    sentAt: sentAt ? new Date(sentAt) : undefined,
    contactId,
    ticketId: finalTicketId,
    userId,
    ticketUserId: ticketUserId ? Number(ticketUserId) : undefined,
    queueId: queueId ? Number(queueId) : undefined,
    openTicket,
    statusTicket,
    whatsappId: whatsappId ? Number(whatsappId) : undefined,
    intervalo,
    valorIntervalo,
    enviarQuantasVezes,
    tipoDias,
    assinar
  });

  const isTicketConstraintError = (err: any): boolean => {
    const databaseMessage =
      err?.original?.message || err?.parent?.message || err?.message || "";

    return (
      typeof databaseMessage === "string" &&
      databaseMessage.includes("ticketId") &&
      databaseMessage.includes("violates not-null constraint")
    );
  };

  try {
    await schedule.update(buildUpdatePayload(resolvedTicketId));
  } catch (err: any) {
    if (isTicketConstraintError(err)) {
      const fallbackTicketId = await resolveScheduleTicketId({
        companyId,
        contactId: contactId ?? schedule.contactId,
        ticketId,
        userId: userId ?? schedule.userId,
        queueId: queueId ?? schedule.queueId,
        whatsappId: whatsappId ?? schedule.whatsappId,
        statusTicket: statusTicket ?? schedule.statusTicket,
        createIfMissing: true
      });

      if (!fallbackTicketId) {
        throw new AppError(
          "La base de datos aún exige ticketId para guardar schedules. Si el mensaje se programa desde un ticket, vuelve a intentarlo con el ticket abierto; si se programa desde la pantalla de schedules, aplica la migración pendiente para permitir ticketId nulo."
        );
      }

      await schedule.update(buildUpdatePayload(fallbackTicketId));
    } else {
      throw err;
    }
  }

  await schedule.reload();
  return schedule;
};

export default UpdateUserService;
