import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * CampaignRuleService
 *
 * Motor de reglas automatizadas para campañas Meta Ads.
 * Permite crear reglas dinámicas que evalúan métricas de campañas
 * y ejecutan acciones automáticas (pausar, ajustar budget, notificar).
 *
 * Reutiliza: getMetaClient() de MetaMarketingService,
 * add("SendMessage") de queues para notificaciones WhatsApp
 */

import CampaignRule, { RuleCondition, RuleAction } from "../models/CampaignRule";
import CampaignRuleLog from "../models/CampaignRuleLog";
import Whatsapp from "../models/Whatsapp";
import logger from "../utils/logger";
import { Op } from "sequelize";

const LOG_PREFIX = "[CampaignRuleService]";

// ============================================================
// TEMPLATES PRE-CONFIGURADOS
// ============================================================

export const RULE_TEMPLATES = [
  {
    id: "pause_high_cpa",
    name: "Pausar CPA alto",
    description: "Pausar campaña automáticamente si el CPA (costo por conversión) supera un umbral definido",
    conditions: [
      { metric: "cost_per_conversion", operator: ">", value: 20, timeRange: "last_7_days", logic: "AND" as const },
      { metric: "conversions", operator: ">", value: 0, timeRange: "last_7_days" }
    ],
    actions: [
      { type: "pause" },
      { type: "notify_whatsapp", params: { message: "⚠️ Regla activada: CPA alto en campaña {{campaignName}}. CPA actual: ${{cost_per_conversion}} (umbral: ${{threshold}}). Campaña pausada automáticamente." } }
    ],
    scope: "campaign" as const,
    frequency: "hourly" as const,
    cooldownMinutes: 120
  },
  {
    id: "scale_winners",
    name: "Escalar ganadores",
    description: "Aumentar presupuesto de campañas con ROAS alto sostenido",
    conditions: [
      { metric: "roas", operator: ">", value: 3.0, timeRange: "last_7_days", logic: "AND" as const },
      { metric: "spend", operator: ">", value: 10, timeRange: "last_7_days" }
    ],
    actions: [
      { type: "adjust_budget", params: { direction: "increase", amount: 20, unit: "percent" } },
      { type: "notify_whatsapp", params: { message: "🚀 Regla activada: Escalando campaña {{campaignName}}. ROAS: {{roas}}x. Presupuesto aumentado 20%." } }
    ],
    scope: "campaign" as const,
    frequency: "daily" as const,
    cooldownMinutes: 1440
  },
  {
    id: "combat_fatigue",
    name: "Combatir fatigue creativo",
    description: "Notificar cuando el CTR baja y la frecuencia sube (señales de fatigue)",
    conditions: [
      { metric: "ctr", operator: "<", value: 0.8, timeRange: "last_7_days", logic: "AND" as const },
      { metric: "frequency", operator: ">", value: 3.0, timeRange: "last_7_days" }
    ],
    actions: [
      { type: "notify_whatsapp", params: { message: "🎨 Fatigue detectado en {{campaignName}}. CTR: {{ctr}}% | Frecuencia: {{frequency}}. Considera rotar creativos." } }
    ],
    scope: "campaign" as const,
    frequency: "daily" as const,
    cooldownMinutes: 1440
  },
  {
    id: "protect_budget",
    name: "Proteger presupuesto",
    description: "Reducir presupuesto si el gasto supera el 90% del budget diario",
    conditions: [
      { metric: "spend_ratio", operator: ">", value: 90, timeRange: "last_1_day" }
    ],
    actions: [
      { type: "adjust_budget", params: { direction: "decrease", amount: 20, unit: "percent" } },
      { type: "notify_whatsapp", params: { message: "💰 Protección de presupuesto en {{campaignName}}. Gasto: ${{spend}} ({{spend_ratio}}% del budget). Reducido 20%." } }
    ],
    scope: "campaign" as const,
    frequency: "hourly" as const,
    cooldownMinutes: 360
  },
  {
    id: "detect_dead",
    name: "Detectar campañas muertas",
    description: "Pausar campañas sin conversiones después de gastar un monto significativo",
    conditions: [
      { metric: "conversions", operator: "=", value: 0, timeRange: "last_3_days", logic: "AND" as const },
      { metric: "spend", operator: ">", value: 50, timeRange: "last_3_days" }
    ],
    actions: [
      { type: "pause" },
      { type: "notify_whatsapp", params: { message: "💀 Campaña muerta: {{campaignName}}. ${{spend}} gastados sin conversiones en 3 días. Pausada automáticamente." } }
    ],
    scope: "campaign" as const,
    frequency: "every_6h" as const,
    cooldownMinutes: 720
  }
];

// ============================================================
// MÉTRICAS SOPORTADAS
// ============================================================

export const SUPPORTED_METRICS = [
  { key: "spend", label: "Gasto (Spend)", unit: "$" },
  { key: "cost_per_conversion", label: "Costo por Conversión (CPA)", unit: "$" },
  { key: "ctr", label: "Click-Through Rate (CTR)", unit: "%" },
  { key: "cpc", label: "Costo por Clic (CPC)", unit: "$" },
  { key: "cpm", label: "Costo por Mil Impresiones (CPM)", unit: "$" },
  { key: "roas", label: "Retorno sobre Gasto (ROAS)", unit: "x" },
  { key: "frequency", label: "Frecuencia", unit: "" },
  { key: "impressions", label: "Impresiones", unit: "" },
  { key: "conversions", label: "Conversiones", unit: "" },
  { key: "reach", label: "Alcance", unit: "" },
  { key: "clicks", label: "Clics", unit: "" },
  { key: "spend_ratio", label: "% del Presupuesto Gastado", unit: "%" }
];

export const SUPPORTED_OPERATORS = [
  { key: ">", label: "Mayor que" },
  { key: "<", label: "Menor que" },
  { key: ">=", label: "Mayor o igual que" },
  { key: "<=", label: "Menor o igual que" },
  { key: "=", label: "Igual a" },
  { key: "!=", label: "Diferente de" },
  { key: "between", label: "Entre" }
];

export const SUPPORTED_TIME_RANGES = [
  { key: "last_1_day", label: "Último día" },
  { key: "last_3_days", label: "Últimos 3 días" },
  { key: "last_7_days", label: "Últimos 7 días" },
  { key: "last_14_days", label: "Últimos 14 días" },
  { key: "last_30_days", label: "Últimos 30 días" }
];

// ============================================================
// SERVICIO PRINCIPAL
// ============================================================

class CampaignRuleService {
  // ---- CRUD ----

  static async createRule(
    companyId: number,
    userId: number,
    data: {
      name: string;
      description?: string;
      scope?: string;
      scopeIds?: string[];
      conditions: RuleCondition[];
      actions: RuleAction[];
      notificationPhones?: string[];
      frequency?: string;
      cooldownMinutes?: number;
    }
  ): Promise<CampaignRule> {
    try {
      if (!data.conditions || data.conditions.length === 0) {
        throw new Error("Se requiere al menos una condición");
      }
      if (!data.actions || data.actions.length === 0) {
        throw new Error("Se requiere al menos una acción");
      }

      const rule = await CampaignRule.create({
        companyId,
        name: data.name,
        description: data.description || "",
        scope: (data.scope as "account" | "campaign" | "adset" | "ad") || "campaign",
        scopeIds: data.scopeIds || null,
        conditions: data.conditions,
        actions: data.actions,
        notificationPhones: data.notificationPhones || null,
        frequency: (data.frequency as "every_15min" | "every_30min" | "hourly" | "every_6h" | "daily") || "hourly",
        cooldownMinutes: data.cooldownMinutes || 60,
        status: "active",
        createdBy: userId
      } as any);

      logger.info(`${LOG_PREFIX} ✅ Regla "${data.name}" creada (ID: ${rule.id}) para empresa ${companyId}`);
      return rule;
    } catch (error: any) {
      logger.error(`${LOG_PREFIX} ❌ Error creando regla: ${error.message}`);
      throw error;
    }
  }

  static async updateRule(
    ruleId: number,
    companyId: number,
    data: Partial<{
      name: string;
      description: string;
      scope: string;
      scopeIds: string[];
      conditions: RuleCondition[];
      actions: RuleAction[];
      notificationPhones: string[];
      frequency: string;
      cooldownMinutes: number;
    }>
  ): Promise<CampaignRule> {
    const rule = await CampaignRule.findOne({ where: { id: ruleId, companyId } });
    if (!rule) throw new Error("Regla no encontrada");

    await rule.update(data as any);
    logger.info(`${LOG_PREFIX} ✅ Regla ${ruleId} actualizada`);
    return rule;
  }

  static async deleteRule(ruleId: number, companyId: number): Promise<boolean> {
    const rule = await CampaignRule.findOne({ where: { id: ruleId, companyId } });
    if (!rule) throw new Error("Regla no encontrada");

    // Eliminar logs asociados primero
    await CampaignRuleLog.destroy({ where: { ruleId } });
    await rule.destroy();

    logger.info(`${LOG_PREFIX} ✅ Regla ${ruleId} eliminada con sus logs`);
    return true;
  }

  static async getRules(
    companyId: number,
    options?: { limit?: number; offset?: number; status?: string }
  ): Promise<{ rules: CampaignRule[]; total: number }> {
    const where: Record<string, unknown> = { companyId };
    if (options?.status) where.status = options.status;

    const { rows: rules, count: total } = await CampaignRule.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: options?.limit || 50,
      offset: options?.offset || 0
    });

    return { rules, total };
  }

  static async getRuleById(ruleId: number, companyId: number): Promise<CampaignRule & { recentLogs?: CampaignRuleLog[] }> {
    const rule = await CampaignRule.findOne({ where: { id: ruleId, companyId } });
    if (!rule) throw new Error("Regla no encontrada");

    // Incluir últimos 10 logs
    const recentLogs = await CampaignRuleLog.findAll({
      where: { ruleId },
      order: [["executedAt", "DESC"]],
      limit: 10
    });

    const result = rule.toJSON() as CampaignRule & { recentLogs: CampaignRuleLog[] };
    (result as any).recentLogs = recentLogs;
    return result;
  }

  static async pauseRule(ruleId: number, companyId: number): Promise<CampaignRule> {
    const rule = await CampaignRule.findOne({ where: { id: ruleId, companyId } });
    if (!rule) throw new Error("Regla no encontrada");
    await rule.update({ status: "paused" });
    logger.info(`${LOG_PREFIX} ⏸️ Regla ${ruleId} pausada`);
    return rule;
  }

  static async activateRule(ruleId: number, companyId: number): Promise<CampaignRule> {
    const rule = await CampaignRule.findOne({ where: { id: ruleId, companyId } });
    if (!rule) throw new Error("Regla no encontrada");
    await rule.update({ status: "active", consecutiveErrors: 0 });
    logger.info(`${LOG_PREFIX} ▶️ Regla ${ruleId} activada`);
    return rule;
  }

  static async getRuleLogs(
    ruleId: number,
    companyId: number,
    options?: { limit?: number; offset?: number }
  ): Promise<{ logs: CampaignRuleLog[]; total: number }> {
    // Verificar que la regla pertenece a la empresa
    const rule = await CampaignRule.findOne({ where: { id: ruleId, companyId } });
    if (!rule) throw new Error("Regla no encontrada");

    const { rows: logs, count: total } = await CampaignRuleLog.findAndCountAll({
      where: { ruleId },
      order: [["executedAt", "DESC"]],
      limit: options?.limit || 50,
      offset: options?.offset || 0
    });

    return { logs, total };
  }

  static getTemplates() {
    return {
      templates: RULE_TEMPLATES,
      metrics: SUPPORTED_METRICS,
      operators: SUPPORTED_OPERATORS,
      timeRanges: SUPPORTED_TIME_RANGES
    };
  }

  // ---- EVALUACIÓN DE CONDICIONES ----

  static evaluateConditions(
    conditions: RuleCondition[],
    metrics: Record<string, number>
  ): boolean {
    if (!conditions || conditions.length === 0) return false;

    let result = true;
    let pendingOr = false;

    for (let i = 0; i < conditions.length; i++) {
      const cond = conditions[i];
      const metricValue = metrics[cond.metric];

      // Si la métrica no existe, la condición no se cumple
      if (metricValue === undefined || metricValue === null) {
        const condResult = false;
        if (pendingOr) {
          result = result || condResult;
          pendingOr = false;
        } else {
          result = result && condResult;
        }
        if (cond.logic === "OR") pendingOr = true;
        continue;
      }

      let condResult = false;
      switch (cond.operator) {
        case ">": condResult = metricValue > cond.value; break;
        case "<": condResult = metricValue < cond.value; break;
        case ">=": condResult = metricValue >= cond.value; break;
        case "<=": condResult = metricValue <= cond.value; break;
        case "=": condResult = metricValue === cond.value; break;
        case "!=": condResult = metricValue !== cond.value; break;
        case "between":
          condResult = cond.value2 !== undefined
            ? metricValue >= cond.value && metricValue <= cond.value2
            : false;
          break;
        default:
          condResult = false;
      }

      if (i === 0) {
        result = condResult;
      } else if (pendingOr) {
        result = result || condResult;
        pendingOr = false;
      } else {
        result = result && condResult;
      }

      if (cond.logic === "OR") pendingOr = true;
    }

    return result;
  }

  // ---- EJECUCIÓN DE ACCIONES ----

  static async executeActions(
    rule: CampaignRule,
    campaignId: string,
    campaignName: string,
    metrics: Record<string, number>,
    metaClient: { campaigns: { updateCampaign: (id: string, data: Record<string, unknown>) => Promise<unknown> } }
  ): Promise<Array<{ type: string; result: string; details?: string }>> {
    const actionResults: Array<{ type: string; result: string; details?: string }> = [];

    for (const action of rule.actions) {
      try {
        switch (action.type) {
          case "pause": {
            await metaClient.campaigns.updateCampaign(campaignId, { status: "PAUSED" });
            actionResults.push({ type: "pause", result: "ok", details: `Campaña ${campaignId} pausada` });
            logger.info(`${LOG_PREFIX} ⏸️ Campaña ${campaignId} pausada por regla ${rule.id}`);
            break;
          }
          case "activate": {
            await metaClient.campaigns.updateCampaign(campaignId, { status: "ACTIVE" });
            actionResults.push({ type: "activate", result: "ok", details: `Campaña ${campaignId} activada` });
            logger.info(`${LOG_PREFIX} ▶️ Campaña ${campaignId} activada por regla ${rule.id}`);
            break;
          }
          case "adjust_budget": {
            const params = action.params;
            if (!params) {
              actionResults.push({ type: "adjust_budget", result: "error", details: "Parámetros faltantes" });
              break;
            }
            // Calcular nuevo budget (usamos daily_budget si existe en métricas)
            const currentBudget = metrics.daily_budget || metrics.spend || 0;
            let newBudget = currentBudget;

            if (params.unit === "percent") {
              const multiplier = params.direction === "increase"
                ? 1 + ((params.amount || 0) / 100)
                : 1 - ((params.amount || 0) / 100);
              newBudget = Math.round(currentBudget * multiplier * 100) / 100;
            } else {
              newBudget = params.direction === "increase"
                ? currentBudget + (params.amount || 0)
                : currentBudget - (params.amount || 0);
            }

            // Meta API espera daily_budget en centavos
            newBudget = Math.max(newBudget, 1); // Mínimo $1
            await metaClient.campaigns.updateCampaign(campaignId, {
              daily_budget: Math.round(newBudget * 100)
            });

            actionResults.push({
              type: "adjust_budget",
              result: "ok",
              details: `Budget ${params.direction} ${params.amount}${params.unit === "percent" ? "%" : "$"}: $${currentBudget} → $${newBudget}`
            });
            logger.info(`${LOG_PREFIX} 💰 Budget ajustado para campaña ${campaignId}: $${currentBudget} → $${newBudget}`);
            break;
          }
          case "notify_whatsapp": {
            // La notificación se maneja por separado en sendNotifications()
            actionResults.push({ type: "notify_whatsapp", result: "queued", details: "Notificación encolada" });
            break;
          }
          default:
            actionResults.push({ type: action.type, result: "unknown", details: `Acción desconocida: ${action.type}` });
        }
      } catch (error: any) {
        actionResults.push({ type: action.type, result: "error", details: error.message });
        logger.error(`${LOG_PREFIX} ❌ Error ejecutando acción ${action.type}: ${error.message}`);
      }
    }

    return actionResults;
  }

  // ---- NOTIFICACIONES WHATSAPP ----

  static async sendNotifications(
    companyId: number,
    phones: string[],
    messageTemplate: string,
    templateVars: Record<string, string | number>
  ): Promise<number> {
    if (!phones || phones.length === 0) return 0;

    try {
      // 1. Buscar conexión isDefault CONNECTED
      const whatsapp = await Whatsapp.findOne({
        where: {
          companyId,
          isDefault: true,
          status: "CONNECTED"
        }
      });

      if (!whatsapp) {
        logger.warn(`${LOG_PREFIX} ⚠️ No hay conexión WhatsApp CONNECTED por defecto para empresa ${companyId}`);
        return 0;
      }

      // 2. Reemplazar variables en el mensaje
      let message = messageTemplate;
      for (const [key, val] of Object.entries(templateVars)) {
        message = message.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(val));
      }

      // 3. Encolar mensaje para cada número
      const { add } = require("../queues");
      let sent = 0;

      for (const phone of phones) {
        const cleanPhone = phone.replace(/\D/g, "");
        if (!cleanPhone || cleanPhone.length < 10) continue;

        try {
          await add("SendMessage", {
            whatsappId: whatsapp.id,
            data: {
              number: cleanPhone,
              body: message,
              companyId
            }
          }, {
            priority: 2,
            removeOnComplete: { age: 3600, count: 100 },
            removeOnFail: { age: 3600, count: 50 }
          });
          sent++;
        } catch (err: any) {
          logger.error(`${LOG_PREFIX} ❌ Error encolando mensaje a ${cleanPhone}: ${err.message}`);
        }
      }

      logger.info(`${LOG_PREFIX} 📱 ${sent}/${phones.length} notificaciones encoladas para empresa ${companyId}`);
      return sent;
    } catch (error: any) {
      logger.error(`${LOG_PREFIX} ❌ Error enviando notificaciones: ${error.message}`);
      return 0;
    }
  }

  // ---- DRY RUN ----

  static async dryRun(
    ruleId: number,
    companyId: number,
    whatsappId?: number
  ): Promise<{
    rule: CampaignRule;
    results: Array<{
      campaignId: string;
      campaignName: string;
      metrics: Record<string, number>;
      conditionsMet: boolean;
      wouldExecute: RuleAction[];
    }>;
  }> {
    const rule = await CampaignRule.findOne({ where: { id: ruleId, companyId } });
    if (!rule) throw new Error("Regla no encontrada");

    // Obtener campañas con insights
    const MetaMarketingService = require("./MetaMarketingService").default;
    const campaigns = await MetaMarketingService.getCampaigns(companyId, {
      status: ["ACTIVE"],
      includeInsights: true,
      timeRange: CampaignRuleService.getTimeRange(rule.conditions[0]?.timeRange || "last_7_days"),
      whatsappId
    });

    const results: Array<{
      campaignId: string;
      campaignName: string;
      metrics: Record<string, number>;
      conditionsMet: boolean;
      wouldExecute: RuleAction[];
    }> = [];

    // Filtrar campañas por scopeIds si aplica
    const targetCampaigns = rule.scopeIds && rule.scopeIds.length > 0
      ? campaigns.filter((c: any) => rule.scopeIds!.includes(c.id))
      : campaigns;

    for (const campaign of targetCampaigns) {
      const metrics = CampaignRuleService.extractMetrics(campaign);
      const conditionsMet = CampaignRuleService.evaluateConditions(rule.conditions, metrics);

      results.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        metrics,
        conditionsMet,
        wouldExecute: conditionsMet ? rule.actions : []
      });
    }

    return { rule, results };
  }

  // ---- HELPERS ----

  static extractMetrics(campaign: Record<string, unknown>): Record<string, number> {
    const insights = (campaign.insights as Record<string, unknown>) || campaign;

    return {
      spend: parseFloat(String(insights.spend || 0)),
      impressions: parseInt(String(insights.impressions || 0), 10),
      clicks: parseInt(String(insights.clicks || 0), 10),
      reach: parseInt(String(insights.reach || 0), 10),
      frequency: parseFloat(String(insights.frequency || 0)),
      ctr: parseFloat(String(insights.ctr || 0)),
      cpc: parseFloat(String(insights.cpc || 0)),
      cpm: parseFloat(String(insights.cpm || 0)),
      conversions: parseInt(String(insights.conversions || 0), 10),
      cost_per_conversion: parseFloat(String(insights.cost_per_conversion || insights.cpa || 0)),
      roas: parseFloat(String(insights.roas || insights.purchase_roas || 0)),
      daily_budget: parseFloat(String(campaign.daily_budget || 0)) / 100, // Meta guarda en centavos
      spend_ratio: (() => {
        const budget = parseFloat(String(campaign.daily_budget || 0)) / 100;
        const spend = parseFloat(String(insights.spend || 0));
        return budget > 0 ? (spend / budget) * 100 : 0;
      })()
    };
  }

  static getTimeRange(timeRangeKey: string): { since: string; until: string } {
    const now = new Date();
    const until = now.toISOString().split("T")[0];

    const daysMap: Record<string, number> = {
      last_1_day: 1,
      last_3_days: 3,
      last_7_days: 7,
      last_14_days: 14,
      last_30_days: 30
    };

    const days = daysMap[timeRangeKey] || 7;
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    return { since, until };
  }

  /**
   * Verifica si una regla está en periodo de cooldown
   */
  static isInCooldown(rule: CampaignRule): boolean {
    if (!rule.lastTriggeredAt) return false;
    const cooldownEnd = new Date(rule.lastTriggeredAt).getTime() + rule.cooldownMinutes * 60 * 1000;
    return Date.now() < cooldownEnd;
  }

  /**
   * Calcula si una regla necesita ser evaluada basado en su frecuencia
   */
  static needsEvaluation(rule: CampaignRule): boolean {
    if (!rule.lastExecutedAt) return true;

    const frequencyMinutes: Record<string, number> = {
      every_15min: 15,
      every_30min: 30,
      hourly: 60,
      every_6h: 360,
      daily: 1440
    };

    const minutes = frequencyMinutes[rule.frequency] || 60;
    const nextRun = new Date(rule.lastExecutedAt).getTime() + minutes * 60 * 1000;
    return Date.now() >= nextRun;
  }

  // ---- REGISTRO DE LOGS ----

  static async createLog(data: {
    ruleId: number;
    companyId: number;
    campaignId?: string;
    campaignName?: string;
    conditionsMet: boolean;
    metricsSnapshot?: Record<string, number>;
    actionsTaken?: Array<{ type: string; result: string; details?: string }>;
    result: "success" | "failed" | "skipped" | "cooldown";
    error?: string;
    notificationsSent?: number;
  }): Promise<CampaignRuleLog> {
    return CampaignRuleLog.create({
      ruleId: data.ruleId,
      companyId: data.companyId,
      campaignId: data.campaignId,
      campaignName: data.campaignName,
      executedAt: new Date(),
      conditionsMet: data.conditionsMet,
      metricsSnapshot: data.metricsSnapshot,
      actionsTaken: data.actionsTaken,
      result: data.result,
      error: data.error,
      notificationsSent: data.notificationsSent || 0
    } as any);
  }

  /**
   * Obtener reglas activas que necesitan evaluarse
   */
  static async getActiveRulesDue(): Promise<CampaignRule[]> {
    const rules = await CampaignRule.findAll({
      where: { status: "active" }
    });

    return rules.filter(rule => CampaignRuleService.needsEvaluation(rule));
  }
}

export default CampaignRuleService;
