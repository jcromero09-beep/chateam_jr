import { FindOptions } from "sequelize/types";
import Queue from "../../models/Queue";
import Whatsapp from "../../models/Whatsapp";
import Telegram from "../../models/Telegram";
import Prompt from "../../models/Prompt";

interface Request {
  companyId: number;
  session?: number | string;
}

interface UnifiedConnection {
  id: number;
  name: string;
  number?: string;
  status: string;
  channel: string;
  isDefault: boolean;
  updatedAt: Date;
  createdAt: Date;
  queues?: any[];
  // Campos específicos de WhatsApp
  qrcode?: string;
  // Campos específicos de Telegram
  botToken?: string;
  botUsername?: string;
  webhookUrl?: string;
}

const ListConnectionsService = async ({
  session,
  companyId
}: Request): Promise<UnifiedConnection[]> => {
  const whatsappOptions: FindOptions = {
    where: {
      companyId
    },
    include: [
      {
        model: Queue,
        as: "queues",
        attributes: ["id", "name", "color", "greetingMessage"]
      },
      {
        model: Prompt,
        as: "prompt",
      }
    ]
  };

  const telegramOptions: FindOptions = {
    where: {
      companyId
    },
    include: [
      {
        model: Queue,
        as: "queues",
        attributes: ["id", "name", "color", "greetingMessage"]
      },
      {
        model: Prompt,
        as: "prompt",
      }
    ]
  };

  if (session !== undefined && session == 0) {
    whatsappOptions.attributes = { exclude: ["session"] };
  }

  // Obtener WhatsApps
  const whatsapps = await Whatsapp.findAll(whatsappOptions);
  
  // Obtener Telegrams
  const telegrams = await Telegram.findAll(telegramOptions);

  // Unificar resultados
  const unifiedConnections: UnifiedConnection[] = [];

  // Agregar WhatsApps
  whatsapps.forEach(whatsapp => {
    unifiedConnections.push({
      id: whatsapp.id,
      name: whatsapp.name,
      number: whatsapp.number,
      status: whatsapp.status,
      channel: whatsapp.channel || "whatsapp",
      isDefault: whatsapp.isDefault,
      updatedAt: whatsapp.updatedAt,
      createdAt: whatsapp.createdAt,
      queues: whatsapp.queues,
      qrcode: whatsapp.qrcode,
    });
  });

  // Agregar Telegrams
  telegrams.forEach(telegram => {
    unifiedConnections.push({
      id: telegram.id,
      name: telegram.name,
      number: telegram.botUsername ? `@${telegram.botUsername}` : `Bot ${telegram.id}`,
      status: telegram.status,
      channel: "telegram",
      isDefault: telegram.isDefault,
      updatedAt: telegram.updatedAt,
      createdAt: telegram.createdAt,
      queues: telegram.queues,
      botToken: telegram.botToken,
      botUsername: telegram.botUsername,
      webhookUrl: telegram.webhookUrl,
    });
  });

  // Ordenar por fecha de actualización (más reciente primero)
  unifiedConnections.sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return unifiedConnections;
};

export default ListConnectionsService;
