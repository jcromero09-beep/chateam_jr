/**
 * CampaignRuleProcessor
 *
 * Job Bull Queue que procesa reglas automatizadas de Meta Ads.
 * Recibe { ruleId, companyId }, evalúa las condiciones de la regla
 * contra las métricas actuales de las campañas y ejecuta las acciones.
 *
 * Ciclo de vida:
 * 1. Cargar regla de BD
 * 2. Verificar status = 'active'
 * 3. Verificar cooldown
 * 4. Determinar campañas target (scopeIds o todas las activas)
 * 5. Obtener insights de Meta API
 * 6. Evaluar condiciones por campaña
 * 7. Ejecutar acciones si condiciones met
 * 8. Guardar CampaignRuleLog por cada campaña evaluada
 * 9. Actualizar contadores de la regla
 */

import { Job } from "bull";
import logger from "../utils/logger";
import CampaignRule from "../models/CampaignRule";
import CampaignRuleService from "../services/CampaignRuleService";
import MetaMarketingService from "../services/MetaMarketingService";
import Whatsapp from "../models/Whatsapp";

const LOG_PREFIX = "[CampaignRuleProcessor]";

interface CampaignRuleJob {
  ruleId: number;
  companyId: number;
}

export default async function CampaignRuleProcessor(job: Job<CampaignRuleJob>): Promise<void> {
  const { ruleId, companyId } = job.data;
  const startTime = Date.now();

  logger.info(`${LOG_PREFIX} 🚀 Procesando regla ID=${ruleId} para empresa ${companyId}`);

  try {
    // 1. Cargar la regla con su estado actual
    const rule = await CampaignRule.findOne({
      where: { id: ruleId, companyId }
    });

    if (!rule) {
      logger.warn(`${LOG_PREFIX} ⚠️ Regla ${ruleId} no encontrada — posiblemente eliminada`);
      return;
    }

    // 2. Verificar que la regla esté activa
    if (rule.status !== "active") {
      logger.info(`${LOG_PREFIX} ⏸️ Regla ${ruleId} no está activa (status: ${rule.status}) — saltando`);
      return;
    }

    // 3. Verificar cooldown global de la regla
    if (CampaignRuleService.isInCooldown(rule)) {
      const cooldownEnd = new Date(
        new Date(rule.lastTriggeredAt).getTime() + rule.cooldownMinutes * 60 * 1000
      );
      logger.info(`${LOG_PREFIX} ⏱️ Regla ${ruleId} en cooldown hasta ${cooldownEnd.toISOString()}`);

      // Registrar log de cooldown
      await CampaignRuleService.createLog({
        ruleId,
        companyId,
        conditionsMet: false,
        result: "cooldown"
      });

      // Actualizar lastExecutedAt
      await rule.update({
        lastExecutedAt: new Date(),
        executionCount: rule.executionCount + 1
      });

      return;
    }

    // 4. Determinar conexión WhatsApp para obtener el cliente Meta
    // Buscar conexión con tokenMeta configurado
    const whatsappConn = await Whatsapp.findOne({
      where: {
        companyId,
        isDefault: true
      }
    });

    const whatsappId = whatsappConn?.id;

    // 5. Obtener campañas con sus métricas
    // Usamos el timeRange del primer condition como referencia
    const primaryTimeRange = rule.conditions[0]?.timeRange || "last_7_days";
    const timeRange = CampaignRuleService.getTimeRange(primaryTimeRange);

    let allCampaigns: Record<string, unknown>[] = [];

    try {
      const result = await MetaMarketingService.getCampaigns(
        companyId,
        {
          status: ["ACTIVE"],
          includeInsights: true,
          timeRange
        },
        whatsappId
      );

      // MetaMarketingService devuelve array de campañas
      allCampaigns = (result as unknown) as Record<string, unknown>[];
    } catch (metaError: any) {
      logger.error(`${LOG_PREFIX} ❌ Error obteniendo campañas de Meta para empresa ${companyId}: ${metaError.message}`);

      // Registrar error en la regla
      const newErrors = rule.consecutiveErrors + 1;
      const updateData: Record<string, unknown> = {
        lastExecutedAt: new Date(),
        executionCount: rule.executionCount + 1,
        consecutiveErrors: newErrors
      };

      // Si hay 3 o más errores consecutivos, pausar la regla automáticamente
      if (newErrors >= 3) {
        updateData.status = "error";
        logger.warn(`${LOG_PREFIX} 🔴 Regla ${ruleId} pausada por errores consecutivos (${newErrors})`);
      }

      await rule.update(updateData as any);

      await CampaignRuleService.createLog({
        ruleId,
        companyId,
        conditionsMet: false,
        result: "failed",
        error: `Error obteniendo métricas de Meta: ${metaError.message}`
      });

      throw metaError; // Re-throw para que Bull reintente
    }

    if (!Array.isArray(allCampaigns) || allCampaigns.length === 0) {
      logger.info(`${LOG_PREFIX} 😴 No hay campañas activas para evaluar en empresa ${companyId}`);
      await rule.update({
        lastExecutedAt: new Date(),
        executionCount: rule.executionCount + 1,
        consecutiveErrors: 0
      });
      return;
    }

    // 6. Filtrar por scopeIds si la regla tiene IDs específicos
    const targetCampaigns = rule.scopeIds && rule.scopeIds.length > 0
      ? allCampaigns.filter((c: any) => rule.scopeIds!.includes(String(c.id)))
      : allCampaigns;

    logger.info(`${LOG_PREFIX} 📊 Evaluando ${targetCampaigns.length} campañas para regla "${rule.name}"`);

    // 7. Obtener cliente Meta para ejecutar acciones
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let metaClient: any = null;
    try {
      const { client } = await (MetaMarketingService as any).getMetaClient(companyId, whatsappId);
      metaClient = client;
    } catch (clientError: any) {
      logger.warn(`${LOG_PREFIX} ⚠️ No se pudo obtener cliente Meta para empresa ${companyId}: ${clientError.message}`);
    }

    // 8. Evaluar condiciones por campaña y ejecutar acciones
    let totalTriggered = 0;
    let totalNotifications = 0;
    let hasErrors = false;

    for (const campaign of targetCampaigns) {
      const campaignId = String((campaign as any).id || "");
      const campaignName = String((campaign as any).name || "");

      try {
        // Extraer métricas de la campaña
        const metrics = CampaignRuleService.extractMetrics(campaign);

        // Evaluar condiciones
        const conditionsMet = CampaignRuleService.evaluateConditions(rule.conditions, metrics);

        logger.info(
          `${LOG_PREFIX} 📋 Campaña "${campaignName}" (${campaignId}): condiciones ${conditionsMet ? "✅ CUMPLIDAS" : "❌ no cumplidas"}`
        );

        if (!conditionsMet) {
          // Registrar que no se cumplieron las condiciones
          await CampaignRuleService.createLog({
            ruleId,
            companyId,
            campaignId,
            campaignName,
            conditionsMet: false,
            metricsSnapshot: metrics,
            result: "skipped"
          });
          continue;
        }

        // Condiciones cumplidas — ejecutar acciones
        totalTriggered++;
        let actionResults: Array<{ type: string; result: string; details?: string }> = [];
        let notificationsSent = 0;
        let actionError: string | undefined;

        // Construir variables de plantilla para mensajes
        const templateVars: Record<string, string | number> = {
          campaignName,
          campaignId,
          ...Object.fromEntries(
            Object.entries(metrics).map(([k, v]) => [k, Number(v.toFixed(2))])
          )
        };

        try {
          if (metaClient) {
            actionResults = await CampaignRuleService.executeActions(
              rule,
              campaignId,
              campaignName,
              metrics,
              metaClient as any
            );
          } else {
            // Sin cliente Meta, solo registrar que se intentó
            actionResults = rule.actions.map(a => ({
              type: a.type,
              result: "skipped",
              details: "Cliente Meta no disponible"
            }));
          }

          // Enviar notificaciones WhatsApp si la regla las tiene configuradas
          const hasNotifyAction = rule.actions.some(a => a.type === "notify_whatsapp");
          if (hasNotifyAction && rule.notificationPhones && rule.notificationPhones.length > 0) {
            const notifyAction = rule.actions.find(a => a.type === "notify_whatsapp");
            const messageTemplate = notifyAction?.params?.message
              || `⚡ Regla "${rule.name}" activada en campaña {{campaignName}}. Condiciones cumplidas.`;

            notificationsSent = await CampaignRuleService.sendNotifications(
              companyId,
              rule.notificationPhones,
              messageTemplate,
              templateVars
            );

            // Actualizar el resultado de la acción notify_whatsapp
            const notifyResult = actionResults.find(r => r.type === "notify_whatsapp");
            if (notifyResult) {
              notifyResult.result = notificationsSent > 0 ? "ok" : "failed";
              notifyResult.details = `${notificationsSent} notificaciones enviadas`;
            }

            totalNotifications += notificationsSent;
          }
        } catch (actionErr: any) {
          actionError = actionErr.message;
          hasErrors = true;
          logger.error(`${LOG_PREFIX} ❌ Error ejecutando acciones para campaña ${campaignId}: ${actionErr.message}`);

          actionResults = rule.actions.map(a => ({
            type: a.type,
            result: "error",
            details: actionErr.message
          }));
        }

        // Registrar log de ejecución exitosa
        await CampaignRuleService.createLog({
          ruleId,
          companyId,
          campaignId,
          campaignName,
          conditionsMet: true,
          metricsSnapshot: metrics,
          actionsTaken: actionResults,
          result: actionError ? "failed" : "success",
          error: actionError,
          notificationsSent
        });

      } catch (campaignError: any) {
        hasErrors = true;
        logger.error(`${LOG_PREFIX} ❌ Error procesando campaña ${campaignId}: ${campaignError.message}`);

        await CampaignRuleService.createLog({
          ruleId,
          companyId,
          campaignId,
          campaignName,
          conditionsMet: false,
          result: "failed",
          error: campaignError.message
        });
      }
    }

    // 9. Actualizar contadores de la regla
    const updateData: Record<string, unknown> = {
      lastExecutedAt: new Date(),
      executionCount: rule.executionCount + 1,
      consecutiveErrors: hasErrors ? rule.consecutiveErrors + 1 : 0
    };

    if (totalTriggered > 0) {
      updateData.lastTriggeredAt = new Date();
      updateData.triggerCount = rule.triggerCount + totalTriggered;
    }

    // Pausar automáticamente si hay 3+ errores consecutivos
    if ((updateData.consecutiveErrors as number) >= 3) {
      updateData.status = "error";
      logger.warn(`${LOG_PREFIX} 🔴 Regla ${ruleId} puesta en error por errores consecutivos`);
    }

    await rule.update(updateData as any);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(
      `${LOG_PREFIX} ✅ Regla "${rule.name}" procesada en ${duration}s — ` +
      `${targetCampaigns.length} campañas evaluadas, ${totalTriggered} triggers, ${totalNotifications} notificaciones`
    );

  } catch (error: any) {
    logger.error(`${LOG_PREFIX} ❌ Error fatal en procesador de regla ${ruleId}: ${error.message}`);
    throw error; // Re-throw para que Bull gestione reintentos
  }
}
