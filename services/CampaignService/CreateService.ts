import * as Yup from "yup";
import moment from "moment";
import AppError from "../../errors/AppError";
import Campaign from "../../models/Campaign";
import ContactList from "../../models/ContactList";
import Whatsapp from "../../models/Whatsapp";
import User from "../../models/User";
import Queue from "../../models/Queue";
import WhatsAppTemplate from "../../models/WhatsAppTemplate";
import logger from "../../utils/logger";

interface Data {
  name: string;
  status?: string;
  confirmation?: boolean;
  scheduledAt?: string | null;
  companyId: number;
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
  // ========================================
  // CAMPOS PARA PLANTILLAS META
  // ========================================
  useTemplate?: boolean;
  whastsAppTemplateId?: number | null;
  templateParams?: Record<string, string>;
}

const EXECUTABLE_STATUSES = ["PROGRAMADA", "EM_ANDAMENTO"];

/**
 * Validaciones condicionales según estado:
 *  - INATIVA (borrador): solo name >= 3. Permite todo null.
 *  - PROGRAMADA / EM_ANDAMENTO (ejecutable): exige template APPROVED,
 *    Whatsapp canal Meta con phoneNumberId + tokenMeta, contactListId
 *    (o tagListId que lo generará en el controller) y scheduledAt futuro
 *    cuando status=PROGRAMADA.
 *  - Compatibilidad legacy: si useTemplate === false se omiten checks de
 *    plantilla pero se exige message1 no vacío.
 */
const CreateService = async (data: Data): Promise<Campaign> => {
  const { name, companyId } = data;

  const nameSchema = Yup.object().shape({
    name: Yup.string()
      .min(3, "ERR_CAMPAIGN_INVALID_NAME")
      .required("ERR_CAMPAIGN_REQUIRED")
  });

  try {
    await nameSchema.validate({ name });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  // Resolver status: si envían scheduledAt y no fijaron status, asume PROGRAMADA
  if (!data.status) {
    data.status = "INATIVA";
  }
  if (
    data.scheduledAt != null &&
    data.scheduledAt !== "" &&
    data.status === "INATIVA"
  ) {
    data.status = "PROGRAMADA";
  }

  const isExecutable = EXECUTABLE_STATUSES.indexOf(data.status) !== -1;

  if (isExecutable) {
    const useTemplate = data.useTemplate !== false; // default true cuando ejecutable

    if (useTemplate) {
      if (!data.whastsAppTemplateId) {
        throw new AppError(
          "Debes seleccionar una plantilla de Meta para programar o ejecutar la campaña",
          400
        );
      }

      const template = await WhatsAppTemplate.findOne({
        where: { id: data.whastsAppTemplateId, companyId }
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
      // Legacy: mensaje libre. Al menos message1 con contenido.
      const msg1 = (data.message1 || "").trim();
      if (!msg1) {
        throw new AppError(
          "Debes escribir al menos un mensaje (message1) cuando no uses plantilla",
          400
        );
      }
    }

    // Validar whatsappId — debe ser canal Meta con credenciales
    if (!data.whatsappId) {
      throw new AppError(
        "Debes seleccionar una conexión WhatsApp para programar la campaña",
        400
      );
    }

    const whatsapp = await Whatsapp.findOne({
      where: { id: data.whatsappId, companyId }
    });

    if (!whatsapp) {
      throw new AppError("Conexión WhatsApp no encontrada", 400);
    }

    if (useTemplate) {
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

    // contactListId requerido (el controller ya lo inyecta si viene tagListId)
    if (!data.contactListId) {
      throw new AppError(
        "Debes asignar una lista de contactos para programar",
        400
      );
    }

    // scheduledAt requerido y futuro solo cuando PROGRAMADA
    if (data.status === "PROGRAMADA") {
      if (!data.scheduledAt) {
        throw new AppError(
          "Debes definir la fecha/hora de programación",
          400
        );
      }

      const scheduled = moment(data.scheduledAt);
      if (!scheduled.isValid()) {
        throw new AppError("La fecha/hora programada no es válida", 400);
      }

      const tolerance = moment().subtract(2, "minutes");
      if (scheduled.isBefore(tolerance)) {
        throw new AppError("La fecha/hora debe ser futura", 400);
      }
    }
  }

  const record = await Campaign.create(data as any);

  logger.info(
    {
      campaignId: record.id,
      companyId,
      status: record.status,
      useTemplate: record.useTemplate,
      whastsAppTemplateId: record.whastsAppTemplateId
    },
    "[CampaignCreate] Campaña creada"
  );

  await record.reload({
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

  return record;
};

export default CreateService;
