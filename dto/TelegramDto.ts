import * as Yup from "yup";

// DTO para crear un bot de Telegram
export interface CreateTelegramDto {
  name: string;
  botToken: string;
  botUsername?: string;
  queueIds?: number[];
  greetingMessage?: string;
  complationMessage?: string;
  outOfHoursMessage?: string;
  farewellMessage?: string;
  inactiveMessage?: string;
  ratingMessage?: string;
  status?: string;
  isDefault?: boolean;
  allowGroup?: boolean;
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

// DTO para actualizar un bot de Telegram
export interface UpdateTelegramDto {
  name?: string;
  botToken?: string;
  botUsername?: string;
  queueIds?: number[];
  greetingMessage?: string;
  complationMessage?: string;
  outOfHoursMessage?: string;
  farewellMessage?: string;
  inactiveMessage?: string;
  ratingMessage?: string;
  status?: string;
  isDefault?: boolean;
  allowGroup?: boolean;
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

// DTO para respuesta de Telegram
export interface TelegramResponseDto {
  id: number;
  name: string;
  botToken: string;
  botUsername?: string;
  status: string;
  webhookUrl?: string;
  companyId: number;
  isDefault: boolean;
  allowGroup: boolean;
  greetingMessage?: string;
  farewellMessage?: string;
  complationMessage?: string;
  outOfHoursMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

// DTO para listar bots con filtros
export interface ListTelegramsDto {
  session?: number | string;
  status?: string;
  isDefault?: boolean;
}

// DTO para webhook de Telegram
export interface TelegramWebhookDto {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    chat: {
      id: number;
      first_name?: string;
      last_name?: string;
      username?: string;
      type: "private" | "group" | "supergroup" | "channel";
      title?: string;
    };
    date: number;
    text?: string;
    photo?: Array<{
      file_id: string;
      file_unique_id: string;
      file_size: number;
      width: number;
      height: number;
    }>;
    caption?: string;
    document?: any;
    voice?: any;
    video?: any;
    sticker?: any;
    location?: any;
    contact?: any;
    reply_to_message?: any;
  };
  edited_message?: any;
  channel_post?: any;
  edited_channel_post?: any;
}

// Validaciones con Yup
export const createTelegramSchema = Yup.object().shape({
  name: Yup.string()
    .required("El nombre es obligatorio")
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(50, "El nombre no puede tener más de 50 caracteres"),

  botToken: Yup.string()
    .required("El token del bot es obligatorio")
    .matches(
      /^\d+:[A-Za-z0-9_-]{35}$/,
      "Token inválido. Formato esperado: 1234567890:AAEhBOweik6ad2r_PE4GVQVQai7zOqv4Org"
    ),

  botUsername: Yup.string()
    .optional()
    .matches(/^[a-zA-Z0-9_]+$/, "El username solo puede contener letras, números y guiones bajos"),

  queueIds: Yup.array()
    .of(Yup.number().positive("Los IDs de cola deben ser números positivos"))
    .min(1, "Debe seleccionar al menos una cola"),

  greetingMessage: Yup.string()
    .optional()
    .max(1000, "El mensaje de bienvenida no puede tener más de 1000 caracteres"),

  farewellMessage: Yup.string()
    .optional()
    .max(1000, "El mensaje de despedida no puede tener más de 1000 caracteres"),

  status: Yup.string()
    .optional()
    .oneOf(["CONNECTED", "DISCONNECTED"], "El estado debe ser CONNECTED o DISCONNECTED"),

  isDefault: Yup.boolean()
    .optional(),

  allowGroup: Yup.boolean()
    .optional(),

  maxUseBotQueues: Yup.number()
    .optional()
    .min(0, "El máximo uso de colas debe ser mayor o igual a 0")
    .max(100, "El máximo uso de colas no puede ser mayor a 100"),

  timeUseBotQueues: Yup.string()
    .optional()
    .matches(/^\d+$/, "El tiempo debe ser un número"),

  expiresTicket: Yup.string()
    .optional()
    .matches(/^\d+$/, "El tiempo de expiración debe ser un número")
});

export const updateTelegramSchema = Yup.object().shape({
  name: Yup.string()
    .optional()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(50, "El nombre no puede tener más de 50 caracteres"),

  botToken: Yup.string()
    .optional()
    .matches(
      /^\d+:[A-Za-z0-9_-]{35}$/,
      "Token inválido. Formato esperado: 1234567890:AAEhBOweik6ad2r_PE4GVQVQai7zOqv4Org"
    ),

  botUsername: Yup.string()
    .optional()
    .matches(/^[a-zA-Z0-9_]+$/, "El username solo puede contener letras, números y guiones bajos"),

  queueIds: Yup.array()
    .optional()
    .of(Yup.number().positive("Los IDs de cola deben ser números positivos")),

  status: Yup.string()
    .optional()
    .oneOf(["CONNECTED", "DISCONNECTED"], "El estado debe ser CONNECTED o DISCONNECTED"),

  isDefault: Yup.boolean()
    .optional(),

  allowGroup: Yup.boolean()
    .optional()
});

export const webhookSchema = Yup.object().shape({
  update_id: Yup.number()
    .required("update_id es obligatorio"),

  message: Yup.object()
    .optional()
    .shape({
      message_id: Yup.number().required(),
      chat: Yup.object().shape({
        id: Yup.number().required(),
        type: Yup.string().oneOf(["private", "group", "supergroup", "channel"]).required()
      }).required()
    })
});
