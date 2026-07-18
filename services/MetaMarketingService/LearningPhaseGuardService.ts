/**
 * [Fase2·D4.1] Protección de la fase de aprendizaje.
 *
 * Meta necesita ~50 conversiones por conjunto para salir de aprendizaje. Tocar el
 * presupuesto o el público durante esa ventana cuenta como "edición significativa"
 * y **reinicia el aprendizaje**: el dinero gastado hasta ese momento se tira y la
 * entrega vuelve a empezar. Es el error mas caro y mas comun del operador ansioso.
 *
 * Aqui no se adivina la fase: se lee `learning_stage_info` que reporta la propia
 * Meta, y se usa `last_sig_edit_ts` (la marca de la ultima edicion significativa)
 * para medir la ventana de 72h, en vez de la fecha de creacion — porque cada
 * edicion significativa reinicia el reloj.
 */
import MetaMarketing from "../../meta-marketing/src";
import logger from "../../utils/logger";
import { getCompanyMetaConfig } from "./index";

const PREFIX = "[LearningGuard]";

export const LEARNING_WINDOW_HOURS = 72;

/** Campos cuya edicion Meta considera "significativa" y reinicia el aprendizaje. */
const RISKY_FIELDS = [
  "daily_budget",
  "lifetime_budget",
  "targeting",
  "bid_amount",
  "bid_strategy",
  "optimization_goal",
  "billing_event",
  "promoted_object"
];

export type LearningStatus = {
  inLearning: boolean;
  status?: string;
  hoursSinceLastSignificantEdit?: number;
  hoursLeft?: number;
  adSetId?: string;
  adSetName?: string;
};

export type GuardDecision = {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
  riskyFields: string[];
  learning: LearningStatus;
};

export const getRiskyFields = (updates: Record<string, any> = {}): string[] =>
  RISKY_FIELDS.filter(f => updates[f] !== undefined);

const buildClient = async (companyId: number, whatsappId?: number) => {
  const config = await getCompanyMetaConfig(companyId, whatsappId);
  return new MetaMarketing({
    accessToken: config.token,
    apiVersion: process.env.FB_GRAPH_VERSION || "v24.0"
  });
};

const readLearning = (adSet: any): LearningStatus => {
  const info = adSet?.learning_stage_info;
  const status = info?.status;
  const inLearningStatus = status === "LEARNING" || status === "LEARNING_LIMITED";

  // last_sig_edit_ts viene en segundos epoch. Si no está, se cae a created_time.
  const tsSec = Number(info?.last_sig_edit_ts) || undefined;
  const baseMs = tsSec
    ? tsSec * 1000
    : adSet?.created_time
      ? new Date(adSet.created_time).getTime()
      : undefined;

  const hours = baseMs ? Math.floor((Date.now() - baseMs) / 3_600_000) : undefined;
  const withinWindow = hours !== undefined && hours < LEARNING_WINDOW_HOURS;

  return {
    // Se protege si Meta dice que esta aprendiendo, o si estamos dentro de las 72h
    // desde la ultima edicion significativa (Meta puede tardar en reportar).
    inLearning: inLearningStatus || withinWindow,
    status,
    hoursSinceLastSignificantEdit: hours,
    hoursLeft: hours !== undefined ? Math.max(0, LEARNING_WINDOW_HOURS - hours) : undefined,
    adSetId: adSet?.id ? String(adSet.id) : undefined,
    adSetName: adSet?.name
  };
};

/** Estado de aprendizaje de un adset, o del "peor" adset de una campaña (CBO). */
export const getLearningStatus = async (params: {
  companyId: number;
  adSetId?: string;
  campaignId?: string;
  whatsappId?: number;
}): Promise<LearningStatus> => {
  const { companyId, adSetId, campaignId, whatsappId } = params;
  const client = await buildClient(companyId, whatsappId);

  try {
    if (adSetId) {
      return readLearning(await client.campaigns.getAdSet(adSetId));
    }
    if (campaignId) {
      // CBO: el presupuesto vive en la campaña pero el aprendizaje ocurre en los
      // conjuntos. Si CUALQUIERA esta aprendiendo, tocar el presupuesto los reinicia.
      const adSets = await client.campaigns.getAdSetsByCampaign(campaignId);
      const states = (adSets || []).map(readLearning);
      return states.find(s => s.inLearning) || states[0] || { inLearning: false };
    }
  } catch (err: any) {
    logger.warn(`${PREFIX} no se pudo leer la fase de aprendizaje: ${err?.message || err}`);
  }
  return { inLearning: false };
};

/**
 * Decide si una edicion puede pasar. No bloquea a lo tonto: solo si la edicion
 * toca campos que reinician el aprendizaje Y hay aprendizaje en curso. El operador
 * puede forzar con confirmed=true (doble confirmacion), sabiendo lo que pierde.
 */
export const evaluateEdit = async (params: {
  companyId: number;
  updates: Record<string, any>;
  adSetId?: string;
  campaignId?: string;
  confirmed?: boolean;
  whatsappId?: number;
}): Promise<GuardDecision> => {
  const riskyFields = getRiskyFields(params.updates);

  if (riskyFields.length === 0) {
    return { allowed: true, requiresConfirmation: false, riskyFields, learning: { inLearning: false } };
  }

  const learning = await getLearningStatus(params);

  if (!learning.inLearning) {
    return { allowed: true, requiresConfirmation: false, riskyFields, learning };
  }

  if (params.confirmed) {
    logger.warn(
      `${PREFIX} edicion FORZADA en aprendizaje company=${params.companyId} ` +
      `campos=${riskyFields.join(",")} adset=${learning.adSetId}`
    );
    return { allowed: true, requiresConfirmation: false, riskyFields, learning };
  }

  const left = learning.hoursLeft ?? LEARNING_WINDOW_HOURS;
  return {
    allowed: false,
    requiresConfirmation: true,
    riskyFields,
    learning,
    reason:
      `El conjunto ${learning.adSetName || learning.adSetId || ""} sigue en fase de aprendizaje` +
      `${learning.status ? ` (${learning.status})` : ""}. Cambiar ${riskyFields.join(", ")} ahora ` +
      `REINICIA el aprendizaje y tira el gasto acumulado. Quedan ~${left}h. ` +
      `Si aun asi quieres hacerlo, repite la peticion con confirm: true.`
  };
};

export default { evaluateEdit, getLearningStatus, getRiskyFields, LEARNING_WINDOW_HOURS };
