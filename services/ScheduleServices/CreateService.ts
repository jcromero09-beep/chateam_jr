import * as Yup from "yup";

import AppError from "../../errors/AppError";
import Schedule from "../../models/Schedule";
import resolveScheduleTicketId from "./resolveScheduleTicketId";

interface Request {
  body: string;
  sendAt: string;
  contactId: number | string;
  companyId: number | string;
  ticketId?: number | string;
  userId?: number | string;
  ticketUserId?: number | string;
  queueId?: number | string;
  openTicket?: string;
  statusTicket?: string;
  whatsappId?: number | string;
  intervalo?: number;
  valorIntervalo?: number;
  enviarQuantasVezes?: number;
  tipoDias?: number;
  contadorEnvio?: number;
  assinar?: boolean;
}

const CreateService = async ({
  body,
  sendAt,
  contactId,
  companyId,
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
  assinar,
  contadorEnvio
}: Request): Promise<Schedule> => {
  const parsedSendAt = new Date(sendAt);

  const schema = Yup.object().shape({
    body: Yup.string().required().min(5),
    sendAt: Yup.string().required().test(
      "is-valid-date",
      "Fecha de envío inválida",
      value => Boolean(value) && !Number.isNaN(new Date(value).getTime())
    )
  });

  try {
    await schema.validate({ body, sendAt });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  if (parsedSendAt.getTime() <= Date.now()) {
    throw new AppError("La fecha debe ser futura");
  }

  const buildSchedulePayload = (resolvedTicketId?: number) => ({
    body,
    sendAt: parsedSendAt,
    contactId: Number(contactId),
    companyId: Number(companyId),
    ticketId: resolvedTicketId,
    userId: userId ? Number(userId) : undefined,
    status: "PENDENTE",
    ticketUserId: ticketUserId ? Number(ticketUserId) : undefined,
    queueId: queueId ? Number(queueId) : undefined,
    openTicket,
    statusTicket,
    whatsappId: whatsappId ? Number(whatsappId) : undefined,
    intervalo,
    valorIntervalo,
    enviarQuantasVezes,
    tipoDias,
    assinar,
    contadorEnvio
  });

  const getDatabaseMessage = (err: any): string =>
    err?.original?.message || err?.parent?.message || err?.message || "";

  let resolvedTicketId = await resolveScheduleTicketId({
    companyId,
    contactId,
    ticketId,
    userId,
    queueId,
    whatsappId,
    statusTicket
  });

  let schedule: Schedule;

  try {
    schedule = await Schedule.create(buildSchedulePayload(resolvedTicketId));
  } catch (err: any) {
    const databaseMessage = getDatabaseMessage(err);

    if (
      typeof databaseMessage === "string" &&
      databaseMessage.includes("ticketId") &&
      databaseMessage.includes("violates not-null constraint")
    ) {
      resolvedTicketId = await resolveScheduleTicketId({
        companyId,
        contactId,
        ticketId,
        userId,
        queueId,
        whatsappId,
        statusTicket,
        createIfMissing: true
      });

      if (resolvedTicketId) {
        schedule = await Schedule.create(buildSchedulePayload(resolvedTicketId));
      } else {
        throw new AppError(
          "La base de datos aún exige ticketId para guardar schedules. Si el mensaje se programa desde un ticket, vuelve a intentarlo con el ticket abierto; si se programa desde la pantalla de schedules, aplica la migración pendiente para permitir ticketId nulo."
        );
      }
    } else {
      throw err;
    }
  }

  await schedule.reload();

  return schedule;
};

export default CreateService;
