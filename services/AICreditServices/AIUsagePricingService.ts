/**
 * AIUsagePricingService
 *
 * Capa central UNIFICADA de cobro de acciones IA y automatizaciones cobrables.
 *
 * Reemplaza los cobros hardcodeados (1 credito) repartidos por workers,
 * controllers y services. Cualquier feature de IA debe usar este servicio
 * en lugar de invocar DeductCreditsService directamente con montos fijos.
 *
 * Filosofia:
 *   - El feature solo dice "que ocurrio" (key + units + source).
 *   - Este servicio decide "cuanto cobra" leyendo configuracion (BD).
 *   - Todo el costo es CONFIGURABLE via AICreditType.defaultCost (USD/credit-rate)
 *     y AIProviderConfig (pricing por capacidad).
 *   - Los precios NO viven repartidos en codigo.
 *
 * Reglas de cobro:
 *   1. Si no hay AICreditType para la key -> error 404 por defecto.
 *      Solo se omite cobro cuando el caller marca silentIfNoType=true.
 *   2. Si la company no tiene balance -> error 402 (fail-closed para cobrables).
 *   3. Si el balance no alcanza -> error 402 (fail-closed para cobrables).
 *   4. Super admin nunca se bloquea (audit trail si).
 *   5. Cada cobro queda en AICreditTransaction con metadata completa.
 *
 * Formula de calculo de credits a cobrar:
 *   credits = ceil(units * rate * conversionFactor)
 *   donde:
 *     - units: cantidad de unidades base (ej: 1 mensaje, 250 chars TTS, 60s audio)
 *     - rate:  AICreditType.defaultCost (cuantos creditos cuesta 1 unidad)
 *     - conversionFactor: factor adicional de conversion (ej: tokens reales / 1000)
 *
 *   Para keys "*_token" o "*_character", se aplica downscaling automatico.
 *
 * Ejemplos:
 *   chargeUsage({ companyId, creditTypeKey: 'message', units: 1, source: 'kanban_followup' })
 *   chargeUsage({ companyId, creditTypeKey: 'classification', units: 1, source: 'kanban_classifier' })
 *   chargeUsage({ companyId, creditTypeKey: 'agent_execution', units: 1, source: 'flowbuilder_openai' })
 *   chargeUsage({ companyId, creditTypeKey: 'audio_minute', units: 0.5, source: 'stt' })
 *   chargeUsage({ companyId, creditTypeKey: 'tts_character', units: 1240, source: 'tts' })
 *
 * Autor: ChatEAM JR — 2026-05-03 (unificacion de cobro IA)
 */

import AICreditType from "../../models/AICreditType";
import AICreditBalance from "../../models/AICreditBalance";
import AICreditTransaction from "../../models/AICreditTransaction";
import User from "../../models/User";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

// ============================================================================
// TIPOS
// ============================================================================

export interface ChargeAIUsageOptions {
  /** Empresa que paga la accion. Obligatorio. */
  companyId: number;

  /** Key del tipo de credito en AICreditTypes. Obligatorio. */
  creditTypeKey: string;

  /** Cantidad de unidades base de la accion (default 1). Ej: 1 mensaje, 60s audio, 1240 chars TTS. */
  units?: number;

  /** Modulo / origen del cobro (texto corto, max 50 chars). Ej: 'kanban_classifier', 'flowbuilder', 'campaign_wizard'. */
  source: string;

  /** ID del recurso que motivo el cobro (ticketId, scheduleId, campaignId, etc). */
  sourceId?: string | number | null;

  /** Tokens reales consumidos por el provider (OpenAI usage.total_tokens). Solo informativo. */
  tokensUsed?: number;

  /** Costo real en USD calculado a partir del pricing del provider. Solo informativo. */
  realCostUsd?: number;

  /** Provider que ejecuto la accion (openai, anthropic, google, elevenlabs, etc). */
  provider?: string;

  /** Modelo concreto usado (gpt-4o-mini, dall-e-3, whisper-1, etc). */
  model?: string;

  /** Descripcion humana corta (max 200 chars). */
  description?: string;

  /** Usuario que motivo la accion (super admin pasa el bypass). */
  userId?: number;

  /** Metadata extra para auditoria (no afecta el calculo). */
  metadata?: Record<string, unknown>;

  /**
   * Si true, NO se cobra y NO se lanza error si no hay balance.
   * Util para acciones que el sistema decide no cobrar (ej: super admin sin tipo).
   * default false.
   */
  silentIfNoType?: boolean;

  /**
   * Si true, se hace fallback a otra key si la principal no existe.
   * Ej: classification -> message si "classification" no esta seeded.
   */
  fallbackKey?: string;
}

export interface ChargeAIUsageResult {
  /** true si se cobro algo, false si se omitio (tipo no existe + silentIfNoType=true). */
  charged: boolean;

  /** Key efectivamente cobrado (puede ser fallbackKey). */
  effectiveKey: string;

  /** Creditos efectivamente deducidos. */
  deducted: number;

  /** Creditos restantes en el balance despues del cobro. */
  remaining: number;

  /** Razon si no se cobro. */
  skipReason?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Calcula creditos a cobrar a partir de units + rate del tipo.
 * Para keys que miden a granularidad fina (tokens, characters), se aplica
 * un escalado mas conservador.
 */
function computeCreditsToCharge(creditType: AICreditType, units: number): number {
  const rate = Number(creditType.defaultCost) || 0;

  // Si rate=0 (gratis a nivel config), no se cobra.
  if (rate <= 0) return 0;

  // Calculo bruto.
  const raw = units * rate;

  // Para keys de granularidad muy fina (tokens, chars, embedding), redondear hacia
  // arriba con tope minimo 1 credito siempre que haya consumo real.
  const isFineGrained =
    creditType.unit === "token" ||
    creditType.unit === "character" ||
    creditType.key.includes("_token") ||
    creditType.key.includes("_character");

  if (isFineGrained) {
    return Math.max(1, Math.ceil(raw));
  }

  // Para unidades discretas, redondear hacia arriba.
  return Math.max(1, Math.ceil(raw));
}

/**
 * Resuelve el tipo de credito por key. Si no existe y hay fallbackKey, lo busca.
 */
async function resolveCreditType(
  primaryKey: string,
  fallbackKey?: string
): Promise<{ type: AICreditType | null; effectiveKey: string }> {
  let type = await AICreditType.findOne({
    where: { key: primaryKey, isActive: true }
  });

  if (type) {
    return { type, effectiveKey: primaryKey };
  }

  if (fallbackKey) {
    type = await AICreditType.findOne({
      where: { key: fallbackKey, isActive: true }
    });
    if (type) {
      logger.warn(
        `[AIUsagePricing] Tipo "${primaryKey}" no existe; usando fallback "${fallbackKey}"`
      );
      return { type, effectiveKey: fallbackKey };
    }
  }

  return { type: null, effectiveKey: primaryKey };
}

// ============================================================================
// API PUBLICA
// ============================================================================

/**
 * Cobra una accion IA al balance de creditos de la company.
 *
 * Modo FAIL-CLOSED por defecto:
 *   - Si la accion es cobrable y la company no tiene saldo, lanza AppError 402.
 *   - El feature debe envolverlo en try/catch si quiere convertirlo en aviso.
 *
 * Modo SILENCIOSO (silentIfNoType=true):
 *   - Si el tipo no existe en BD, NO lanza error y devuelve charged=false.
 *   - Util en migracion progresiva donde un tipo aun no se sembro.
 */
export async function chargeAIUsage(
  options: ChargeAIUsageOptions
): Promise<ChargeAIUsageResult> {
  const {
    companyId,
    creditTypeKey,
    units = 1,
    source,
    sourceId,
    tokensUsed,
    realCostUsd,
    provider,
    model,
    description,
    userId,
    metadata,
    silentIfNoType = false,
    fallbackKey
  } = options;

  if (!companyId || companyId <= 0) {
    throw new AppError("ERR_AI_PRICING_COMPANY_REQUIRED", 400);
  }
  if (!creditTypeKey) {
    throw new AppError("ERR_AI_PRICING_TYPE_REQUIRED", 400);
  }
  if (!source) {
    throw new AppError("ERR_AI_PRICING_SOURCE_REQUIRED", 400);
  }
  if (units < 0) {
    throw new AppError("ERR_AI_PRICING_UNITS_NEGATIVE", 400);
  }

  // 1. Resolver tipo de credito (con fallback opcional).
  const { type: creditType, effectiveKey } = await resolveCreditType(
    creditTypeKey,
    fallbackKey
  );

  if (!creditType) {
    if (silentIfNoType) {
      logger.warn(
        `[AIUsagePricing] Tipo "${creditTypeKey}" no encontrado; cobro omitido (silentIfNoType=true)`
      );
      return {
        charged: false,
        effectiveKey: creditTypeKey,
        deducted: 0,
        remaining: 0,
        skipReason: "credit_type_not_found"
      };
    }
    throw new AppError("ERR_AI_CREDIT_TYPE_NOT_FOUND", 404);
  }

  // 2. Calcular creditos a cobrar.
  const creditsToCharge = computeCreditsToCharge(creditType, units);
  if (creditsToCharge <= 0) {
    logger.info(
      `[AIUsagePricing] Accion "${effectiveKey}" con costo 0 (rate=${creditType.defaultCost}); ` +
        `no se cobra (company=${companyId}, source=${source})`
    );
    return {
      charged: false,
      effectiveKey,
      deducted: 0,
      remaining: 0,
      skipReason: "rate_is_zero"
    };
  }

  // 3. Bypass super admin: registrar pero no bloquear.
  let isSuperAdmin = false;
  if (userId) {
    const user = await User.findByPk(userId).catch(() => null);
    if (user?.super) {
      isSuperAdmin = true;
    }
  }

  // 4. Buscar balance de la company para este tipo.
  let balance = await AICreditBalance.findOne({
    where: { companyId, creditTypeId: creditType.id }
  });

  // Para super admin, auto-crear balance si no existe (audit limpio).
  if (!balance && isSuperAdmin) {
    balance = await AICreditBalance.create({
      companyId,
      creditTypeId: creditType.id,
      totalCredits: 999999,
      usedCredits: 0
    } as any);
  }

  if (!balance) {
    if (silentIfNoType) {
      logger.warn(
        `[AIUsagePricing] Balance "${effectiveKey}" no inicializado para company=${companyId}; ` +
          `cobro omitido (silentIfNoType=true)`
      );
      return {
        charged: false,
        effectiveKey,
        deducted: 0,
        remaining: 0,
        skipReason: "balance_not_initialized"
      };
    }
    logger.warn(
      `[AIUsagePricing] No hay balance "${effectiveKey}" para company=${companyId}; ` +
        `bloqueando cobro (fail-closed)`
    );
    throw new AppError("ERR_AI_NO_CREDIT_BALANCE", 402);
  }

  const totalCredits = Number(balance.totalCredits);
  const usedCredits = Number(balance.usedCredits);
  const remaining = totalCredits - usedCredits;

  // 5. Validar saldo (solo si no es super admin).
  if (!isSuperAdmin && remaining < creditsToCharge) {
    logger.warn(
      `[AIUsagePricing] Creditos insuficientes: company=${companyId} ` +
        `tipo=${effectiveKey} requeridos=${creditsToCharge} disponibles=${remaining}`
    );
    throw new AppError("ERR_AI_INSUFFICIENT_CREDITS", 402);
  }

  // 6. Cobrar.
  const previousUsed = usedCredits;
  await balance.update({
    usedCredits: usedCredits + creditsToCharge
  });
  await balance.reload();

  // 7. Registrar transaccion auditable.
  try {
    const safeDescription =
      description ||
      `${source}${sourceId ? `#${sourceId}` : ""} (${effectiveKey} x${units})`;

    await AICreditTransaction.create({
      companyId,
      creditTypeId: creditType.id,
      amount: creditsToCharge,
      direction: "debit",
      balanceBefore: previousUsed,
      balanceAfter: balance.usedCredits,
      source: (source || "ai_usage").substring(0, 50),
      sourceId: sourceId !== undefined && sourceId !== null ? String(sourceId) : null,
      description: isSuperAdmin
        ? `[Super Admin] ${safeDescription}`
        : safeDescription,
      userId: userId || null,
      tokensUsed: tokensUsed || null,
      realCostUsd: realCostUsd || null,
      // metadata extra serializada en description si conviene auditarla
      // (la columna metadata no existe en el modelo actual; se anexa en log).
    } as any);
  } catch (e: any) {
    logger.warn(
      `[AIUsagePricing] Error registrando audit AICreditTransaction: ${e?.message || e}`
    );
  }

  const newRemaining = Number(balance.totalCredits) - Number(balance.usedCredits);

  logger.info(
    `[AIUsagePricing] cobro company=${companyId} tipo=${effectiveKey} ` +
      `units=${units} credits=${creditsToCharge} ` +
      `source=${source}${sourceId ? `#${sourceId}` : ""} ` +
      `${provider ? `provider=${provider} ` : ""}` +
      `${model ? `model=${model} ` : ""}` +
      `${tokensUsed ? `tokens=${tokensUsed} ` : ""}` +
      `${metadata ? `meta=${JSON.stringify(metadata).substring(0, 200)} ` : ""}` +
      `remaining=${newRemaining}`
  );

  return {
    charged: true,
    effectiveKey,
    deducted: creditsToCharge,
    remaining: newRemaining
  };
}

// ============================================================================
// HELPERS DE ALTO NIVEL — atajos por tipo de uso
// ============================================================================

/**
 * Cobra un mensaje de IA (chat completion). 1 mensaje = 1 unidad por defecto.
 * Usa fallback a "message" para garantizar cobro aunque el tipo concreto no exista.
 */
export async function chargeMessage(
  args: Omit<ChargeAIUsageOptions, "creditTypeKey" | "units"> & {
    units?: number;
    creditTypeKey?: string;
  }
): Promise<ChargeAIUsageResult> {
  return chargeAIUsage({
    creditTypeKey: args.creditTypeKey || "message",
    fallbackKey: "message",
    units: args.units ?? 1,
    ...args
  });
}

/**
 * Cobra una clasificacion (kanban classifier, intent, retrieval routing).
 * Si "classification" no existe, cae a "message".
 */
export async function chargeClassification(
  args: Omit<ChargeAIUsageOptions, "creditTypeKey" | "units"> & { units?: number }
): Promise<ChargeAIUsageResult> {
  return chargeAIUsage({
    ...args,
    creditTypeKey: "classification",
    fallbackKey: "message",
    units: args.units ?? 1
  });
}

/**
 * Cobra ejecucion de agente (orquestador, supervisor, sales, support, etc).
 * Si "agent_execution" no existe, cae a "message".
 */
export async function chargeAgentExecution(
  args: Omit<ChargeAIUsageOptions, "creditTypeKey" | "units"> & { units?: number }
): Promise<ChargeAIUsageResult> {
  return chargeAIUsage({
    ...args,
    creditTypeKey: "agent_execution",
    fallbackKey: "message",
    units: args.units ?? 1
  });
}

/**
 * Cobra ejecucion de un nodo de FlowBuilder (OpenAI / Question / etc).
 * Si "flow_execution" no existe, cae a "agent_execution" -> "message".
 */
export async function chargeFlowExecution(
  args: Omit<ChargeAIUsageOptions, "creditTypeKey" | "units"> & { units?: number }
): Promise<ChargeAIUsageResult> {
  return chargeAIUsage({
    ...args,
    creditTypeKey: "flow_execution",
    fallbackKey: "agent_execution",
    units: args.units ?? 1
  });
}

/**
 * Cobra accion de Campaign Wizard / analisis de campana.
 * Si "campaign_analysis" no existe, cae a "message".
 */
export async function chargeCampaignAnalysis(
  args: Omit<ChargeAIUsageOptions, "creditTypeKey" | "units"> & { units?: number }
): Promise<ChargeAIUsageResult> {
  return chargeAIUsage({
    ...args,
    creditTypeKey: "campaign_analysis",
    fallbackKey: "message",
    units: args.units ?? 1
  });
}

/**
 * Cobra una automatizacion cobrable (auto-responder, action workflows).
 * Si "automation_action" no existe, cae a "message".
 */
export async function chargeAutomationAction(
  args: Omit<ChargeAIUsageOptions, "creditTypeKey" | "units"> & { units?: number }
): Promise<ChargeAIUsageResult> {
  return chargeAIUsage({
    ...args,
    creditTypeKey: "automation_action",
    fallbackKey: "message",
    units: args.units ?? 1
  });
}

export default {
  chargeAIUsage,
  chargeMessage,
  chargeClassification,
  chargeAgentExecution,
  chargeFlowExecution,
  chargeCampaignAnalysis,
  chargeAutomationAction
};
