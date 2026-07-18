import * as Yup from "yup";
import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import AssociateWhatsappQueue from "../WhatsappService/AssociateWhatsappQueue";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";

interface TikTokData {
  name?: string;
  tiktokAccessToken?: string;
  tiktokRefreshToken?: string;
  tiktokOpenId?: string;
  tiktokTokenExpiresAt?: string;
  tiktokPollingEnabled?: boolean;
  status?: string;
  greetingMessage?: string;
  complationMessage?: string;
  outOfHoursMessage?: string;
  farewellMessage?: string;
  inactiveMessage?: string;
  ratingMessage?: string;
  isDefault?: boolean;
  allowGroup?: boolean;
  queueIds?: number[];
  maxUseBotQueues?: number;
  timeUseBotQueues?: string;
  expiresTicket?: string;
  timeSendQueue?: number;
  sendIdQueue?: number;
  timeInactiveMessage?: string;
  maxUseBotQueuesNPS?: number;
  expiresTicketNPS?: number;
  whenExpiresTicket?: string;
  expiresInactiveMessage?: string;
  groupAsTicket?: string;
  timeCreateNewTicket?: number;
  integrationId?: number;
  schedules?: any[];
  promptId?: number;
  collectiveVacationMessage?: string;
  collectiveVacationStart?: string;
  collectiveVacationEnd?: string;
  queueIdImportMessages?: number;
  flowIdNotPhrase?: number;
  flowIdWelcome?: number;
}

interface Request {
  tiktokData: TikTokData;
  tiktokId: string | number;
  companyId: number;
}

interface Response {
  tiktok: Whatsapp;
  oldDefaultTikTok: Whatsapp | null;
}

const UpdateTikTokService = async ({
  tiktokData,
  tiktokId,
  companyId
}: Request): Promise<Response> => {
  const tiktok = await ShowWhatsAppService(tiktokId, companyId);

  // Schema de validación
  const schema = Yup.object().shape({
    name: Yup.string().min(2, "Nombre debe tener al menos 2 caracteres"),
    isDefault: Yup.boolean()
  });

  try {
    await schema.validate(tiktokData);
  } catch (err: any) {
    throw new AppError(err.message);
  }

  // Verificar nombre único
  if (tiktokData.name && tiktokData.name !== tiktok.name) {
    const nameExists = await Whatsapp.findOne({
      where: {
        name: tiktokData.name,
        companyId,
        channel: "tiktok",
        id: { $ne: tiktok.id }
      }
    });

    if (nameExists) {
      throw new AppError("Este nombre ya está siendo utilizado por otra conexión TikTok");
    }
  }

  // Verificar Open ID único
  if (tiktokData.tiktokOpenId && tiktokData.tiktokOpenId !== tiktok.tiktokOpenId) {
    const openIdExists = await Whatsapp.findOne({
      where: {
        tiktokOpenId: tiktokData.tiktokOpenId,
        channel: "tiktok",
        id: { $ne: tiktok.id }
      }
    });

    if (openIdExists) {
      throw new AppError("Este Open ID de TikTok ya está siendo utilizado");
    }
  }

  let oldDefaultTikTok: Whatsapp | null = null;

  // Gestionar conexión por defecto
  if (tiktokData.isDefault === true && !tiktok.isDefault) {
    oldDefaultTikTok = await Whatsapp.findOne({
      where: { isDefault: true, companyId, channel: "tiktok" }
    });

    if (oldDefaultTikTok) {
      await oldDefaultTikTok.update({ isDefault: false });
    }
  }

  // Validar filas múltiples
  if (
    tiktokData.queueIds &&
    tiktokData.queueIds.length > 1 &&
    !tiktokData.greetingMessage &&
    !tiktok.greetingMessage
  ) {
    throw new AppError("Mensaje de bienvenida es obligatorio cuando hay multiples filas");
  }

  // Actualizar conexión TikTok
  await tiktok.update({
    ...tiktokData,
    expiresTicket: tiktokData.expiresTicket ? Number(tiktokData.expiresTicket) : undefined
  } as any);

  // Actualizar filas si fueron proporcionadas
  if (tiktokData.queueIds !== undefined) {
    await AssociateWhatsappQueue(tiktok, tiktokData.queueIds);
  }

  // Recargar con relaciones
  await tiktok.reload({
    include: ["queues"]
  });

  return { tiktok, oldDefaultTikTok };
};

export default UpdateTikTokService;
