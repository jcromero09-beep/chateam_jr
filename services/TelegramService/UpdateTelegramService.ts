import * as Yup from "yup";
import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import AssociateWhatsappQueue from "../WhatsappService/AssociateWhatsappQueue";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";

interface TelegramData {
  name?: string;
  botToken?: string;
  botUsername?: string;
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
  telegramData: TelegramData;
  telegramId: string | number;
  companyId: number;
}

interface Response {
  telegram: Whatsapp;
  oldDefaultTelegram: Whatsapp | null;
}

const UpdateTelegramService = async ({
  telegramData,
  telegramId,
  companyId
}: Request): Promise<Response> => {
  const telegram = await ShowWhatsAppService(telegramId, companyId);

  // Schema de validação
  const schema = Yup.object().shape({
    name: Yup.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
    botToken: Yup.string().matches(
      /^\d+:[A-Za-z0-9_-]{35}$/,
      "Token inválido. Formato esperado: 1234567890:AAEhBOweik6ad2r_PE4GVQVQai7zOqv4Org"
    ),
    isDefault: Yup.boolean()
  });

  try {
    await schema.validate(telegramData);
  } catch (err: any) {
    throw new AppError(err.message);
  }

  // Verificar nome único
  if (telegramData.name && telegramData.name !== telegram.name) {
    const nameExists = await Whatsapp.findOne({
      where: {
        name: telegramData.name,
        companyId,
        channel: "telegram",
        id: { $ne: telegram.id }
      }
    });

    if (nameExists) {
      throw new AppError("Este nombre ya está siendo utilizado por otro bot");
    }
  }

  // Verificar token único
  if (telegramData.botToken && telegramData.botToken !== telegram.botToken) {
    const tokenExists = await Whatsapp.findOne({
      where: {
        botToken: telegramData.botToken,
        channel: "telegram",
        id: { $ne: telegram.id }
      }
    });

    if (tokenExists) {
      throw new AppError("Este token ya está siendo utilizado");
    }
  }

  let oldDefaultTelegram: Whatsapp | null = null;

  // Gerenciar bot padrão
  if (telegramData.isDefault === true && !telegram.isDefault) {
    oldDefaultTelegram = await Whatsapp.findOne({
      where: { isDefault: true, companyId, channel: "telegram" }
    });
    
    if (oldDefaultTelegram) {
      await oldDefaultTelegram.update({ isDefault: false });
    }
  }

  // Validar filas múltiplas
  if (
    telegramData.queueIds &&
    telegramData.queueIds.length > 1 &&
    !telegramData.greetingMessage &&
    !telegram.greetingMessage
  ) {
    throw new AppError("Mensaje de bienvenida es obligatorio cuando hay multiples filas");
  }

  // Atualizar bot
  await telegram.update({
    ...telegramData,
    expiresTicket: telegramData.expiresTicket ? Number(telegramData.expiresTicket) : undefined
  } as any);

  // Atualizar filas se fornecidas
  if (telegramData.queueIds !== undefined) {
    await AssociateWhatsappQueue(telegram, telegramData.queueIds);
  }

  // Recarregar com relacionamentos
  await telegram.reload({
    include: ["queues"]
  });

  return { telegram, oldDefaultTelegram };
};

export default UpdateTelegramService;
