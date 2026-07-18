import * as Yup from "yup";

// ============================================================
// INTERFACES — TikTok Channel DTOs
// ============================================================

export interface CreateTikTokDto {
  name: string;
  code: string; // OAuth2 authorization code
  companyId: number;
  queueIds?: number[];
  greetingMessage?: string;
  farewellMessage?: string;
  outOfHoursMessage?: string;
  isDefault?: boolean;
}

export interface UpdateTikTokDto {
  name?: string;
  tiktokPollingEnabled?: boolean;
  tiktokPollingInterval?: number;
  queueIds?: number[];
  greetingMessage?: string;
  farewellMessage?: string;
  outOfHoursMessage?: string;
  isDefault?: boolean;
}

export interface TikTokOAuthCallbackDto {
  code: string;
  state: string;
}

// ============================================================
// SCHEMAS — Validaciones Yup
// ============================================================

export const createTikTokSchema = Yup.object().shape({
  name: Yup.string()
    .required("El nombre es obligatorio")
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(50, "El nombre debe tener máximo 50 caracteres"),
  code: Yup.string()
    .required("El código de autorización de TikTok es obligatorio"),
  queueIds: Yup.array()
    .of(Yup.number().positive().integer())
    .optional(),
  greetingMessage: Yup.string().optional().max(1000),
  farewellMessage: Yup.string().optional().max(1000),
  outOfHoursMessage: Yup.string().optional().max(1000),
  isDefault: Yup.boolean().optional(),
});

export const updateTikTokSchema = Yup.object().shape({
  name: Yup.string()
    .optional()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(50, "El nombre debe tener máximo 50 caracteres"),
  tiktokPollingEnabled: Yup.boolean().optional(),
  tiktokPollingInterval: Yup.number()
    .optional()
    .oneOf([30, 60, 120, 300, 600], "Intervalo debe ser 30, 60, 120, 300 o 600 segundos"),
  queueIds: Yup.array()
    .of(Yup.number().positive().integer())
    .optional(),
  greetingMessage: Yup.string().optional().max(1000),
  farewellMessage: Yup.string().optional().max(1000),
  outOfHoursMessage: Yup.string().optional().max(1000),
  isDefault: Yup.boolean().optional(),
});

export const oauthCallbackSchema = Yup.object().shape({
  code: Yup.string().required("El código OAuth es obligatorio"),
  state: Yup.string().required("El state es obligatorio"),
});

// ============================================================
// NUEVOS DTOs — Comments & Business API
// ============================================================

export interface ReplyToCommentDto {
  replyText: string;
}

export interface ConnectBusinessDto {
  code: string;
}

export const replyToCommentSchema = Yup.object().shape({
  replyText: Yup.string()
    .required("El texto de la respuesta es obligatorio")
    .max(500, "La respuesta debe tener máximo 500 caracteres"),
});

export const connectBusinessSchema = Yup.object().shape({
  code: Yup.string()
    .required("El código de autorización Business es obligatorio"),
});
