import CompanyMetaConversionSetting from "../../models/CompanyMetaConversionSetting";
import logger from "../../utils/logger";

export const META_CONVERSION_EVENT_KEYS = [
  "purchase",
  "complete_registration",
  "start_trial",
  "login",
  "website_lead",
  "campaign_message_lead",
  "kanban_legacy_lead",
  "kanban_custom_conversion",
  "appointment_booked"
] as const;

export type MetaConversionEventKey = typeof META_CONVERSION_EVENT_KEYS[number];

export type MetaConversionPolicyDecision = {
  eventKey: MetaConversionEventKey;
  enabled: boolean;
  conversionName: string;
  source: "company_override" | "default" | "default_fallback";
  reason?: string;
  settingId?: number;
};

export const META_CONVERSION_POLICY_ADMIN_COMPANY_IDS = [1, 8];

const COMPANY_ADMIN_ONLY_EVENT_KEYS = new Set<MetaConversionEventKey>([
  "complete_registration",
  "start_trial",
  "login"
]);

type DefaultPolicy = {
  enabled: boolean;
  conversionName: string;
  description: string;
};

export const DEFAULT_META_CONVERSION_POLICIES: Record<MetaConversionEventKey, DefaultPolicy> = {
  purchase: {
    enabled: true,
    conversionName: "Venta",
    description: "Purchase manual/checkout confirmado"
  },
  complete_registration: {
    enabled: true,
    conversionName: "Registro de cliente",
    description: "Empresa/cliente creado en Chateam"
  },
  start_trial: {
    enabled: true,
    conversionName: "Inicio de prueba",
    description: "Inicio de prueba o QR/conexión inicial configurada"
  },
  login: {
    enabled: true,
    conversionName: "Login",
    description: "Inicio de sesión en Chateam"
  },
  website_lead: {
    enabled: false,
    conversionName: "Lead",
    description: "Lead genérico website/system; activar solo por empresa"
  },
  campaign_message_lead: {
    enabled: false,
    conversionName: "Lead de campaña",
    description: "Lead automático cuando entra un mensaje desde campaña/anuncio"
  },
  kanban_legacy_lead: {
    enabled: false,
    conversionName: "Lead Kanban legacy",
    description: "Lead legacy por etiqueta Kanban; mantener apagado si se usan conversiones Kanban personalizadas"
  },
  kanban_custom_conversion: {
    enabled: true,
    conversionName: "Conversión Kanban personalizada",
    description: "Conversión dinámica por etiqueta Kanban con sendMetaConversion=true"
  },
  // [Fase2·B1.1] Schedule al reservar cita. Sin dataset CAPI configurado no se
  // envía nada, así que el default activo no afecta a empresas sin integración.
  appointment_booked: {
    enabled: true,
    conversionName: "Cita agendada",
    description: "Schedule cuando se reserva una cita (módulo Citas)"
  }
};

export const isMetaConversionEventKey = (value: string): value is MetaConversionEventKey =>
  META_CONVERSION_EVENT_KEYS.includes(value as MetaConversionEventKey);

export const getEventKeyFromMetaEventName = (eventName: string): MetaConversionEventKey => {
  switch (eventName) {
    case "Purchase":
      return "purchase";
    case "CompleteRegistration":
      return "complete_registration";
    case "StartTrial":
      return "start_trial";
    case "Login":
      return "login";
    case "Schedule":
      return "appointment_booked";
    case "Lead":
      return "website_lead";
    default:
      return "website_lead";
  }
};

export const getDefaultMetaConversionPolicies = () =>
  META_CONVERSION_EVENT_KEYS.map(eventKey => ({
    eventKey,
    ...DEFAULT_META_CONVERSION_POLICIES[eventKey]
  }));

const getEffectiveDefaultPolicy = (
  companyId: number,
  eventKey: MetaConversionEventKey
): DefaultPolicy => {
  const fallback = DEFAULT_META_CONVERSION_POLICIES[eventKey];

  if (
    COMPANY_ADMIN_ONLY_EVENT_KEYS.has(eventKey) &&
    !META_CONVERSION_POLICY_ADMIN_COMPANY_IDS.includes(Number(companyId))
  ) {
    return {
      ...fallback,
      enabled: false,
      description: `${fallback.description}; solo disponible para empresas autorizadas`
    };
  }

  return fallback;
};

export const getCompanyMetaConversionPolicies = async (
  companyId: number
): Promise<MetaConversionPolicyDecision[]> => {
  const settings = await CompanyMetaConversionSetting.findAll({
    where: { companyId },
    order: [["eventKey", "ASC"]]
  });

  const byKey = new Map(settings.map(setting => [setting.eventKey, setting]));

  return META_CONVERSION_EVENT_KEYS.map(eventKey => {
    const fallback = getEffectiveDefaultPolicy(companyId, eventKey);
    const setting = byKey.get(eventKey);

    return {
      eventKey,
      enabled: setting?.enabled ?? fallback.enabled,
      conversionName: setting?.conversionName || fallback.conversionName,
      source: setting ? "company_override" : "default",
      settingId: setting?.id
    };
  });
};

export const upsertCompanyMetaConversionPolicy = async ({
  companyId,
  eventKey,
  enabled,
  conversionName,
  notes,
  metadata
}: {
  companyId: number;
  eventKey: MetaConversionEventKey;
  enabled: boolean;
  conversionName?: string | null;
  notes?: string | null;
  metadata?: object | null;
}): Promise<CompanyMetaConversionSetting> => {
  const fallback = getEffectiveDefaultPolicy(companyId, eventKey);
  const payload = {
    companyId,
    eventKey,
    enabled,
    conversionName: conversionName || fallback.conversionName,
    notes: notes || null,
    metadata: metadata || null
  };

  const existing = await CompanyMetaConversionSetting.findOne({
    where: { companyId, eventKey }
  });

  if (existing) {
    await existing.update(payload as any);
    return existing;
  }

  return CompanyMetaConversionSetting.create(payload as any);
};

export const shouldSendMetaConversion = async ({
  companyId,
  eventKey
}: {
  companyId: number;
  eventKey: MetaConversionEventKey;
}): Promise<MetaConversionPolicyDecision> => {
  const fallback = getEffectiveDefaultPolicy(companyId, eventKey);

  try {
    const setting = await CompanyMetaConversionSetting.findOne({
      where: { companyId, eventKey }
    });

    if (!setting) {
      return {
        eventKey,
        enabled: fallback.enabled,
        conversionName: fallback.conversionName,
        source: "default",
        reason: fallback.enabled ? undefined : "disabled_by_default"
      };
    }

    return {
      eventKey,
      enabled: setting.enabled,
      conversionName: setting.conversionName || fallback.conversionName,
      source: "company_override",
      settingId: setting.id,
      reason: setting.enabled ? undefined : "disabled_by_company_policy"
    };
  } catch (error: any) {
    logger.warn(
      `[META-CONVERSION-POLICY] fallback company=${companyId} eventKey=${eventKey} ` +
      `enabled=${fallback.enabled} error=${error?.message || error}`
    );

    return {
      eventKey,
      enabled: fallback.enabled,
      conversionName: fallback.conversionName,
      source: "default_fallback",
      reason: fallback.enabled ? "policy_lookup_failed_enabled_by_default" : "policy_lookup_failed_disabled_by_default"
    };
  }
};
