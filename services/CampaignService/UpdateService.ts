import moment from "moment";
import AppError from "../../errors/AppError";
import Campaign from "../../models/Campaign";
import ContactList from "../../models/ContactList";
import Queue from "../../models/Queue";
import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import WhatsAppTemplate from "../../models/WhatsAppTemplate";
import logger from "../../utils/logger";

interface UpdateData {
  name?: string;
  status?: string;
  confirmation?: boolean;
  scheduledAt?: string | null;
  contactListId?: number | null;
  whatsappId?: number | null;
  message1?: string;
  message2?: string;
  message3?: string;
  message4?: string;
  message5?: string;
  confirmationMessage1?: string;
  confirmationMessage2?: string;
  confirmationMessage3?: string;
  confirmationMessage4?: string;
  confirmationMessage5?: string;
  userId?: number | string | null;
  queueId?: number | string | null;
  statusTicket?: string;
  openTicket?: string;
  useTemplate?: boolean;
  whastsAppTemplateId?: number | null;
  templateParams?: Record<string, string>;
}

interface UpdateServiceParams {
  id: number | string;
  data: UpdateData;
  companyId: number | string;
}

const EDITABLE_STATUSES = ["INATIVA", "PROGRAMADA"];
const EXECUTABLE_STATUSES = ["PROGRAMADA", "EM_ANDAMENTO"];

/**
 * Update endurecido — el bloqueo depende SOLO del estado persistido en BD,
 * nunca del status enviado en el body (evita bypass del cliente).
 *
 * NOTA: intencionalmente NO agregamos columna processingStartedAt; el
 * endurecimiento por estado persistido es suficiente.
 */
const UpdateService = async (
  params: UpdateServiceParams
): Promise<Campaign> => {
  const { id, data, companyId } = params;

  const current = await Campaign.findOne({
    where: { id, companyId }
  });

  if (!current) {
    throw new AppError("ERR_NO_CAMPAIGN_FOUND", 404);
  }

  // Bloqueo por estado persistido real
  if (EDITABLE_STATUSES.indexOf(current.status) === -1) {
    throw new AppError(
      "Campaña en ejecución/finalizada/cancelada, no editable. Reinicia para crear una nueva.",
      403
    );
  }

  // Nombre (si viene en body) debe tener al menos 3 chars
  if (typeof data.name === "string" && data.name.trim().length < 3) {
    throw new AppError("ERR_CAMPAIGN_INVALID_NAME", 400);
  }

  // Determinar status objetivo (si cliente no manda nada mantenemos el actual)
  let targetStatus = data.status || current.status;

  // Si pasan scheduledAt y el estado actual es INATIVA, promover a PROGRAMADA
  if (
    data.scheduledAt != null &&
    data.scheduledAt !== "" &&
    targetStatus === "INATIVA"
  ) {
    targetStatus = "PROGRAMADA";
  }

  // Si el cliente intenta moverla a un estado ejecutable o ya está PROGRAMADA y se edita,
  // aplicar validaciones.
  const willBeExecutable = EXECUTABLE_STATUSES.indexOf(targetStatus) !== -1;

  if (willBeExecutable) {
    const useTemplate =
      data.useTemplate !== undefined ? data.useTemplate : current.useTemplate;

    const effectiveTemplateId =
      data.whastsAppTemplateId !== undefined
        ? data.whastsAppTemplateId
        : current.whastsAppTemplateId;

    const effectiveWhatsappId =
      data.whatsappId !== undefined ? data.whatsappId : current.whatsappId;

    const effectiveContactListId =
      data.contactListId !== undefined
        ? data.contactListId
        : current.contactListId;

    const effectiveScheduledAt =
      data.scheduledAt !== undefined
        ? data.scheduledAt
        : current.scheduledAt
        ? current.scheduledAt.toISOString()
        : null;

    if (useTemplate !== false) {
      if (!effectiveTemplateId) {
        throw new AppError(
          "Debes seleccionar una plantilla de Meta para programar o ejecutar la campaña",
          400
        );
      }

      const template = await WhatsAppTemplate.findOne({
        where: { id: effectiveTemplateId, companyId }
      });

      if (!template) {
        throw new AppError("Plantilla Meta no encontrada", 400);
      }

      if (template.status !== "APPROVED") {
        throw new AppError(
          "La plantilla debe estar APPROVED en Meta",
          400
        );
      }
    } else {
      const msg1 = (data.message1 ?? current.message1 ?? "").trim();
      if (!msg1) {
        throw new AppError(
          "Debes escribir al menos un mensaje (message1) cuando no uses plantilla",
          400
        );
      }
    }

    if (!effectiveWhatsappId) {
      throw new AppError(
        "Debes seleccionar una conexión WhatsApp para programar la campaña",
        400
      );
    }

    const whatsapp = await Whatsapp.findOne({
      where: { id: effectiveWhatsappId, companyId }
    });

    if (!whatsapp) {
      throw new AppError("Conexión WhatsApp no encontrada", 400);
    }

    if (useTemplate !== false) {
      if (
        whatsapp.channel !== "meta" ||
        !whatsapp.phoneNumberId ||
        !whatsapp.tokenMeta
      ) {
        throw new AppError(
          "La conexión WhatsApp debe ser Meta (Cloud API) con phoneNumberId y tokenMeta",
          400
        );
      }
    }

    if (!effectiveContactListId) {
      throw new AppError(
        "Debes asignar una lista de contactos para programar",
        400
      );
    }

    if (targetStatus === "PROGRAMADA") {
      if (!effectiveScheduledAt) {
        throw new AppError(
          "Debes definir la fecha/hora de programación",
          400
        );
      }

      const scheduled = moment(effectiveScheduledAt);
      if (!scheduled.isValid()) {
        throw new AppError("La fecha/hora programada no es válida", 400);
      }

      const tolerance = moment().subtract(2, "minutes");
      if (scheduled.isBefore(tolerance)) {
        throw new AppError("La fecha/hora debe ser futura", 400);
      }
    }
  }

  const updatePayload: Record<string, unknown> = { ...data, status: targetStatus };
  // Nunca permitir sobreescribir companyId desde body
  delete updatePayload.companyId;

  await current.update(updatePayload as any);

  logger.info(
    {
      campaignId: current.id,
      companyId,
      status: current.status
    },
    "[CampaignUpdate] Campaña actualizada"
  );

  await current.reload({
    include: [
      { model: ContactList },
      { model: Whatsapp, attributes: ["id", "name", "channel", "phoneNumberId"] },
      { model: User, attributes: ["id", "name"] },
      { model: Queue, attributes: ["id", "name"] },
      {
        model: WhatsAppTemplate,
        as: "whastsAppTemplate",
        attributes: ["id", "name", "status", "category", "language"]
      }
    ]
  });

  return current;
};

export default UpdateService;
