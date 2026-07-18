import * as Yup from "yup";

import AppError from "../../errors/AppError";
import Tag from "../../models/Tag";
import buildUniqueTagKey from "./buildTagKey";

interface Request {
  name: string;
  color: string;
  key?: string;
  kanban?: number;
  companyId: number;
  timeLane?: number;
  nextLaneId?: number;
  greetingMessageLane?: string;
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

const CreateService = async ({
  name,
  color = "#A4CCCC",
  key,
  kanban = 0,
  companyId,
  timeLane = null,
  nextLaneId = null,
  greetingMessageLane = "",
  rollbackLaneId = null,
  description = "",
  followupEnabled = false,
  followupCount = 1,
  followupMessage1 = "",
  followupDelay1 = 1,
  followupMessage2 = "",
  followupDelay2 = 3,
  followupMessage3 = "",
  followupDelay3 = 4,
  followupType = "multiple",
  timeLaneUnit = "hours",
  aiGuidance1 = "",
  aiGuidance2 = "",
  aiGuidance3 = "",
  sendMetaConversion = false,
  metaConversionName = null,
  metaEventName = null,
  metaLeadStatus = null,
  metaCustomEventType = null,
  metaRule = null,
  metaValue = null,
  metaCurrency = null
}: Request): Promise<Tag> => {
  const schema = Yup.object().shape({
    name: Yup.string().required().min(3)
  });

  try {
    await schema.validate({ name });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  // [Fase2·B5.1] Vacío/no numérico/negativo = "sin valor" (el dispatcher omite
  // el campo en custom_data), nunca 0: un Purchase de $0 falsea el ROAS.
  const parsedValue =
    metaValue === null || metaValue === undefined || metaValue === ""
      ? null
      : Number(metaValue);
  const normalizedValue =
    parsedValue !== null && Number.isFinite(parsedValue) && parsedValue >= 0
      ? parsedValue
      : null;
  const normalizedCurrency = /^[A-Z]{3}$/.test(
    String(metaCurrency || "").trim().toUpperCase()
  )
    ? String(metaCurrency).trim().toUpperCase()
    : null;

  // `key` único por empresa: respeta el provisto o autogenera un slug.
  // Las etiquetas Kanban dinámicas necesitan key para el dispatcher de
  // conversiones y el clasificador de etapas.
  const resolvedKey =
    key && key.trim()
      ? key.trim()
      : await buildUniqueTagKey(name, companyId);

  const [tag] = await Tag.findOrCreate({
    where: { name, color, kanban, companyId },
    defaults: {
      name, color, kanban, companyId,
      key: resolvedKey,
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
      aiGuidance3,
      sendMetaConversion: !!sendMetaConversion,
      metaConversionName,
      metaEventName,
      metaLeadStatus,
      metaCustomEventType,
      metaRule,
      metaValue: normalizedValue,
      metaCurrency: normalizedCurrency,
      metaConversionStatus: sendMetaConversion ? "pending" : null
    } as any
  });

  // Si la etiqueta ya existía y no tenía key, completarla (retrocompat).
  if (!tag.key) {
    await tag.update({ key: resolvedKey } as any);
  }

  await tag.reload();

  return tag;
};

export default CreateService;
