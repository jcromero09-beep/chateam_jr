import * as Yup from "yup";

import AppError from "../../errors/AppError";
import Tag from "../../models/Tag";
import ShowService from "./ShowService";
import buildUniqueTagKey from "./buildTagKey";

interface TagData {
  id?: number;
  name?: string;
  color?: string;
  key?: string;
  kanban?: number;
  timeLane?: number;
  nextLaneId?: number;
  greetingMessageLane: string;
  rollbackLaneId?: number;
  description?: string;
  followupEnabled?: boolean;
  followupCount?: number;
  followupMessage1?: string;
  followupDelay1?: number;
  followupMessage2?: string;
  followupDelay2?: number;
  followupMessage3?: string;
  followupDelay3?: number;
  followupType?: string;
  timeLaneUnit?: string;
  aiGuidance1?: string;
  aiGuidance2?: string;
  aiGuidance3?: string;
  // Conversión personalizada Meta
  sendMetaConversion?: boolean;
  metaConversionName?: string;
  metaEventName?: string;
  metaLeadStatus?: string;
  metaCustomEventType?: string;
  metaRule?: string;
  // [Fase2·B5.1] Valor monetario por etapa (configurable). null/"" = sin valor.
  metaValue?: number | string | null;
  metaCurrency?: string | null;
}

interface Request {
  tagData: TagData;
  id: string | number;
}

const UpdateUserService = async ({
  tagData,
  id
}: Request): Promise<Tag | undefined> => {
  const tag = await ShowService(id);

  const schema = Yup.object().shape({
    name: Yup.string().min(3)
  });

  const { name, color, key, kanban,
    timeLane,
    nextLaneId = null,
    greetingMessageLane,
    rollbackLaneId = null,
    description,
    followupEnabled,
    followupCount,
    followupMessage1,
    followupDelay1,
    followupMessage2,
    followupDelay2,
    followupMessage3,
    followupDelay3,
    followupType,
    timeLaneUnit,
    aiGuidance1,
    aiGuidance2,
    aiGuidance3,
    sendMetaConversion,
    metaConversionName,
    metaEventName,
    metaLeadStatus,
    metaCustomEventType,
    metaRule,
    metaValue,
    metaCurrency } = tagData;

  try {
    await schema.validate({ name });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  // Resolver `key`: usar el provisto; si la etiqueta no tiene key, autogenerar.
  let resolvedKey: string | undefined;
  if (key && key.trim()) {
    resolvedKey = key.trim();
  } else if (!tag.key && name) {
    resolvedKey = await buildUniqueTagKey(name, tag.companyId, tag.id);
  }

  const updateData: any = {
    name,
    color,
    kanban,
    timeLane,
    nextLaneId: String(nextLaneId) === "" ? null : nextLaneId,
    greetingMessageLane,
    rollbackLaneId: String(rollbackLaneId) === "" ? null : rollbackLaneId,
    description,
    followupEnabled,
    followupCount,
    followupMessage1,
    followupDelay1,
    followupMessage2,
    followupDelay2,
    followupMessage3,
    followupDelay3,
    followupType,
    timeLaneUnit,
    aiGuidance1,
    aiGuidance2,
    aiGuidance3
  };

  if (resolvedKey) updateData.key = resolvedKey;

  // Campos Meta: solo se tocan si vienen en el payload (no pisar con undefined).
  if (sendMetaConversion !== undefined) {
    updateData.sendMetaConversion = !!sendMetaConversion;
    // Apagar el check deshabilita la conversión sin borrar la config.
    if (!sendMetaConversion) updateData.metaConversionStatus = "disabled";
  }
  if (metaConversionName !== undefined) updateData.metaConversionName = metaConversionName;
  if (metaEventName !== undefined) updateData.metaEventName = metaEventName;
  if (metaLeadStatus !== undefined) updateData.metaLeadStatus = metaLeadStatus;
  if (metaCustomEventType !== undefined) updateData.metaCustomEventType = metaCustomEventType;
  if (metaRule !== undefined) updateData.metaRule = metaRule;
  // [Fase2·B5.1] Valor por etapa. Las columnas existían y el dispatcher YA las envía a Meta
  // (`value`+`currency` en custom_data), pero no había forma de escribirlas: ni UI ni update
  // => 0/13 etapas con valor => Meta recibía conversiones SIN valor => ROAS incalculable.
  // Vacío/null = "sin valor" (el dispatcher omite el campo), no 0.
  if (metaValue !== undefined) {
    const n = metaValue === null || metaValue === "" ? null : Number(metaValue);
    updateData.metaValue = n !== null && Number.isFinite(n) && n >= 0 ? n : null;
  }
  if (metaCurrency !== undefined) {
    const c = String(metaCurrency || "").trim().toUpperCase();
    updateData.metaCurrency = /^[A-Z]{3}$/.test(c) ? c : null;
  }

  const metaConfigTouched =
    metaConversionName !== undefined ||
    metaEventName !== undefined ||
    metaLeadStatus !== undefined ||
    metaCustomEventType !== undefined ||
    metaRule !== undefined;

  const willSendMetaConversion =
    sendMetaConversion !== undefined ? !!sendMetaConversion : !!tag.sendMetaConversion;

  if (willSendMetaConversion && (sendMetaConversion !== undefined || metaConfigTouched)) {
    updateData.metaConversionStatus = "pending";
    updateData.metaLastError = null;
  }

  await tag.update(updateData);

  await tag.reload();
  return tag;
};

export default UpdateUserService;
