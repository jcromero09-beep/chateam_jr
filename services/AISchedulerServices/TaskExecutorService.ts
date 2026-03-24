import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import logger from "../../utils/logger";

/**
 * TaskExecutorService — Despacha la ejecucion de tareas programadas
 * al handler correspondiente segun su taskType.
 */

type TaskType =
  | "kb_refresh"
  | "metrics_aggregation"
  | "ticket_auto_index"
  | "rss_ingest"
  | "cache_cleanup"
  | "credit_reset"
  | "fine_tuning_check"
  | "ab_test_evaluate"
  | "report_generate"
  | "kanban_optimizer"
  | "custom";

interface TaskInput {
  id: number;
  companyId: number;
  taskType: TaskType;
  config: Record<string, unknown>;
  timeoutMs?: number;
}

interface TaskResult {
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

/**
 * Handler: kb_refresh
 * Re-procesa documentos pendientes en la base de conocimiento.
 */
const handleKbRefresh = async (companyId: number, config: Record<string, unknown>): Promise<TaskResult> => {
  try {
    // Buscar documentos con status 'pending' o 'error' para re-chunking
    const pendingDocs = await sequelize.query<Record<string, unknown>>(`
      SELECT id, title, "rawContent", "contentType"
      FROM "AIDocuments"
      WHERE "companyId" = :companyId
        AND status IN ('pending', 'error')
      ORDER BY "createdAt" ASC
      LIMIT :limit
    `, {
      replacements: {
        companyId,
        limit: (config.limit as number) || 10
      },
      type: QueryTypes.SELECT
    });

    if (pendingDocs.length === 0) {
      return { success: true, result: { processed: 0, message: "Sin documentos pendientes" } };
    }

    const ChunkingService = require("../RAGServices/ChunkingService").default;
    let processed = 0;
    let errors = 0;

    for (const doc of pendingDocs) {
      try {
        const content = doc.rawContent as string;
        if (!content || content.trim().length === 0) {
          continue;
        }

        const chunks = ChunkingService.semanticChunking
          ? ChunkingService.semanticChunking(content, (config.maxTokens as number) || 512)
          : ChunkingService.fixedChunking(content, (config.maxTokens as number) || 512, (config.overlap as number) || 50);

        // Eliminar chunks anteriores
        await sequelize.query(`
          DELETE FROM "AIChunks" WHERE "documentId" = :docId
        `, { replacements: { docId: doc.id }, type: QueryTypes.DELETE });

        // Insertar nuevos chunks
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          await sequelize.query(`
            INSERT INTO "AIChunks" ("documentId", "companyId", content, "chunkIndex", metadata, "createdAt", "updatedAt")
            VALUES (:docId, :companyId, :content, :chunkIndex, :metadata, NOW(), NOW())
          `, {
            replacements: {
              docId: doc.id,
              companyId,
              content: chunk.text || chunk.content || "",
              chunkIndex: i,
              metadata: JSON.stringify({ tokens: chunk.tokens || 0 })
            },
            type: QueryTypes.INSERT
          });
        }

        // Marcar documento como procesado
        await sequelize.query(`
          UPDATE "AIDocuments" SET status = 'processed', "updatedAt" = NOW()
          WHERE id = :docId
        `, { replacements: { docId: doc.id }, type: QueryTypes.UPDATE });

        processed++;
      } catch (docError: unknown) {
        errors++;
        const errMsg = docError instanceof Error ? docError.message : "Error desconocido";
        logger.error(`[TaskExecutor] kb_refresh doc ${doc.id}: ${errMsg}`);

        await sequelize.query(`
          UPDATE "AIDocuments" SET status = 'error', "updatedAt" = NOW()
          WHERE id = :docId
        `, { replacements: { docId: doc.id }, type: QueryTypes.UPDATE });
      }
    }

    return {
      success: true,
      result: { processed, errors, total: pendingDocs.length }
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: `kb_refresh: ${message}` };
  }
};

/**
 * Handler: metrics_aggregation
 */
const handleMetricsAggregation = async (companyId: number, config: Record<string, unknown>): Promise<TaskResult> => {
  try {
    const MetricsAggregatorService = require("../AIDashboardServices/MetricsAggregatorService").default;
    const date = (config.date as string) || new Date().toISOString().split("T")[0];
    await MetricsAggregatorService.aggregateDaily(date, companyId);
    return { success: true, result: { date, companyId } };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: `metrics_aggregation: ${message}` };
  }
};

/**
 * Handler: ticket_auto_index
 */
const handleTicketAutoIndex = async (companyId: number, config: Record<string, unknown>): Promise<TaskResult> => {
  try {
    const TicketAutoIndexService = require("../AIGraphRAGServices/TicketAutoIndexService").default;
    const limit = (config.limit as number) || 20;
    const result = await TicketAutoIndexService.batchIndexResolved(companyId, limit);
    return { success: true, result: result as Record<string, unknown> };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: `ticket_auto_index: ${message}` };
  }
};

/**
 * Handler: rss_ingest
 */
const handleRssIngest = async (companyId: number, config: Record<string, unknown>): Promise<TaskResult> => {
  try {
    const feedUrl = config.feedUrl as string;
    if (!feedUrl) {
      return { success: false, error: "rss_ingest: feedUrl es requerido en config" };
    }

    const AIRSSService = require("../AIMultimodalServices/AIRSSService").default;
    const options = (config.options as Record<string, unknown>) || {};
    const result = await AIRSSService.ingestToKB(feedUrl, companyId, options);
    return { success: true, result: result as Record<string, unknown> };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: `rss_ingest: ${message}` };
  }
};

/**
 * Handler: cache_cleanup
 * Elimina entradas antiguas del cache semantico.
 */
const handleCacheCleanup = async (companyId: number, config: Record<string, unknown>): Promise<TaskResult> => {
  try {
    const days = (config.days as number) || 30;
    await sequelize.query(`
      DELETE FROM "AISemanticCaches"
      WHERE "companyId" = :companyId
        AND "createdAt" < NOW() - INTERVAL '${days} days'
    `, {
      replacements: { companyId },
      type: QueryTypes.DELETE
    });

    return {
      success: true,
      result: { cleaned: true, daysThreshold: days }
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: `cache_cleanup: ${message}` };
  }
};

/**
 * Handler: credit_reset
 * Resetea los creditos usados a 0 para la empresa.
 */
const handleCreditReset = async (companyId: number): Promise<TaskResult> => {
  try {
    // Resetear créditos usados (fix: columna correcta es "usedCredits", no "used")
    const [, affectedRows] = await sequelize.query(`
      UPDATE "AICreditBalances"
      SET "usedCredits" = 0, "updatedAt" = NOW()
      WHERE "companyId" = :companyId
        AND ("resetAt" IS NULL OR "resetAt" <= NOW())
    `, {
      replacements: { companyId },
      type: QueryTypes.UPDATE
    });

    // Avanzar resetAt al próximo ciclo para balances con fecha vencida
    await sequelize.query(`
      UPDATE "AICreditBalances"
      SET "resetAt" = NOW() + INTERVAL '1 month'
      WHERE "companyId" = :companyId
        AND "resetAt" IS NOT NULL AND "resetAt" <= NOW()
    `, {
      replacements: { companyId },
      type: QueryTypes.UPDATE
    });

    // Resetear ejecuciones usadas en asignaciones de agentes
    await sequelize.query(`
      UPDATE "AIAgentAssignments"
      SET "executionsUsed" = 0, "updatedAt" = NOW()
      WHERE "companyId" = :companyId AND "isActive" = true
    `, {
      replacements: { companyId },
      type: QueryTypes.UPDATE
    });

    return {
      success: true,
      result: { reset: affectedRows || 0, companyId }
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: `credit_reset: ${message}` };
  }
};

/**
 * Handler: fine_tuning_check
 * Verifica el estado de los jobs de fine-tuning en estado 'training'.
 */
const handleFineTuningCheck = async (companyId: number): Promise<TaskResult> => {
  try {
    // Verificar si existe el servicio
    let FineTuningService: { checkTrainingJobs?: (companyId: number) => Promise<unknown> };
    try {
      FineTuningService = require("../AIFineTuningServices/FineTuningService").default;
    } catch {
      // El servicio no existe aun, consultar directamente
      const trainingJobs = await sequelize.query<Record<string, unknown>>(`
        SELECT id, "jobId", status, provider
        FROM "AIFineTuningJobs"
        WHERE "companyId" = :companyId AND status = 'training'
      `, {
        replacements: { companyId },
        type: QueryTypes.SELECT
      });

      return {
        success: true,
        result: { trainingJobs: trainingJobs.length, message: "Jobs consultados (servicio no disponible)" }
      };
    }

    if (FineTuningService.checkTrainingJobs) {
      const result = await FineTuningService.checkTrainingJobs(companyId);
      return { success: true, result: result as Record<string, unknown> };
    }

    return { success: true, result: { message: "checkTrainingJobs no implementado" } };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: `fine_tuning_check: ${message}` };
  }
};

/**
 * Handler: ab_test_evaluate
 * Evalua los tests A/B en estado 'running'.
 */
const handleAbTestEvaluate = async (companyId: number): Promise<TaskResult> => {
  try {
    let ABTestService: { evaluateRunningTests?: (companyId: number) => Promise<unknown> };
    try {
      ABTestService = require("../AIABTestingServices/ABTestService").default;
    } catch {
      // El servicio no existe aun, consultar directamente
      const runningTests = await sequelize.query<Record<string, unknown>>(`
        SELECT id, name, status
        FROM "AIABTests"
        WHERE "companyId" = :companyId AND status = 'running'
      `, {
        replacements: { companyId },
        type: QueryTypes.SELECT
      });

      return {
        success: true,
        result: { runningTests: runningTests.length, message: "Tests consultados (servicio no disponible)" }
      };
    }

    if (ABTestService.evaluateRunningTests) {
      const result = await ABTestService.evaluateRunningTests(companyId);
      return { success: true, result: result as Record<string, unknown> };
    }

    return { success: true, result: { message: "evaluateRunningTests no implementado" } };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: `ab_test_evaluate: ${message}` };
  }
};

/**
 * Handler: report_generate
 */
const handleReportGenerate = async (companyId: number, config: Record<string, unknown>): Promise<TaskResult> => {
  try {
    const CostOptimizerService = require("../AICostOptimizationServices/CostOptimizerService").default;
    const days = (config.days as number) || 30;
    const result = await CostOptimizerService.generateCostReport(companyId, days);
    return { success: true, result: result as Record<string, unknown> };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: `report_generate: ${message}` };
  }
};

/**
 * Handler: kanban_optimizer
 * Analiza el funnel Kanban y ajusta automáticamente timeLane por etapa.
 * Usa datos de KanbanMovementLogs de los últimos N días para calcular tiempos óptimos.
 */
const handleKanbanOptimizer = async (companyId: number, config: Record<string, unknown>): Promise<TaskResult> => {
  try {
    const days = (config.days as number) || 30;
    const autoApply = (config.autoApply as boolean) || false;

    // 1. Consultar tiempos reales vs configurados por etapa
    const stageAnalysis = await sequelize.query<Record<string, unknown>>(`
      SELECT
        t.id AS "tagId",
        t.key AS "tagKey",
        t.name AS "tagName",
        t."timeLane" AS "configuredTimeLane",
        t."timeLaneUnit" AS "timeLaneUnit",
        COUNT(DISTINCT kml."ticketId") AS "ticketCount",
        ROUND(AVG(EXTRACT(EPOCH FROM (
          COALESCE(
            (SELECT MIN(k2."createdAt") FROM "KanbanMovementLogs" k2
             WHERE k2."ticketId" = kml."ticketId"
             AND k2."fromTagId" = t.id
             AND k2."createdAt" > kml."createdAt"),
            NOW()
          ) - kml."createdAt"
        )) / 3600), 2) AS "avgHoursInStage",
        ROUND(
          COUNT(DISTINCT CASE WHEN kml2."toTagId" IS NOT NULL THEN kml."ticketId" END)::NUMERIC /
          NULLIF(COUNT(DISTINCT kml."ticketId"), 0) * 100, 1
        ) AS "advanceRate"
      FROM "Tags" t
      LEFT JOIN "KanbanMovementLogs" kml ON kml."toTagId" = t.id
        AND kml."companyId" = :companyId
        AND kml."createdAt" >= NOW() - INTERVAL '${days} days'
      LEFT JOIN "KanbanMovementLogs" kml2 ON kml2."fromTagId" = t.id
        AND kml2."ticketId" = kml."ticketId"
        AND kml2."createdAt" > kml."createdAt"
      WHERE t."companyId" = :companyId AND t.kanban = 1
      GROUP BY t.id, t.key, t.name, t."timeLane", t."timeLaneUnit"
      ORDER BY t.id ASC
    `, {
      replacements: { companyId },
      type: QueryTypes.SELECT
    });

    // 2. Generar recomendaciones
    const recommendations: Array<{
      tagKey: string;
      tagName: string;
      currentTimeLane: number;
      currentUnit: string;
      suggestedTimeLane: number;
      suggestedUnit: string;
      reason: string;
      confidence: number;
    }> = [];

    for (const stage of stageAnalysis) {
      const avgHours = Number(stage.avgHoursInStage) || 0;
      const advanceRate = Number(stage.advanceRate) || 0;
      const configuredTimeLane = Number(stage.configuredTimeLane) || 0;
      const unit = (stage.timeLaneUnit as string) || "hours";

      // Convertir todo a horas para comparar
      const configuredHours = unit === "minutes" ? configuredTimeLane / 60 :
                              unit === "days" ? configuredTimeLane * 24 :
                              configuredTimeLane;

      if (configuredHours === 0 || avgHours === 0) continue;

      // Si el avance es alto (>70%) y el tiempo promedio real es significativamente menor al configurado
      if (advanceRate > 70 && avgHours < configuredHours * 0.6) {
        const suggestedHours = Math.max(1, Math.round(avgHours * 1.2)); // 20% margen
        recommendations.push({
          tagKey: stage.tagKey as string,
          tagName: stage.tagName as string,
          currentTimeLane: configuredTimeLane,
          currentUnit: unit,
          suggestedTimeLane: suggestedHours,
          suggestedUnit: "hours",
          reason: `Tasa avance ${advanceRate}% alta, tiempo real (${avgHours}h) << configurado (${configuredHours}h). Reducir para acelerar pipeline.`,
          confidence: Math.min(0.95, advanceRate / 100),
        });
      }
      // Si el avance es bajo (<30%) y el tiempo configurado es muy corto
      else if (advanceRate < 30 && avgHours > configuredHours * 1.5) {
        const suggestedHours = Math.round(avgHours * 0.8);
        recommendations.push({
          tagKey: stage.tagKey as string,
          tagName: stage.tagName as string,
          currentTimeLane: configuredTimeLane,
          currentUnit: unit,
          suggestedTimeLane: suggestedHours,
          suggestedUnit: "hours",
          reason: `Tasa avance ${advanceRate}% baja, tickets permanecen ${avgHours}h en esta etapa. Ajustar timeLane.`,
          confidence: 0.6,
        });
      }
    }

    // 3. Auto-aplicar si está habilitado y hay recomendaciones con alta confianza
    let applied = 0;
    if (autoApply && recommendations.length > 0) {
      for (const rec of recommendations.filter(r => r.confidence >= 0.8)) {
        await sequelize.query(`
          UPDATE "Tags"
          SET "timeLane" = :timeLane, "timeLaneUnit" = :unit, "updatedAt" = NOW()
          WHERE "companyId" = :companyId AND key = :key
        `, {
          replacements: {
            timeLane: rec.suggestedTimeLane,
            unit: rec.suggestedUnit,
            companyId,
            key: rec.tagKey
          },
          type: QueryTypes.UPDATE
        });

        // Log del cambio
        try {
          await sequelize.query(`
            INSERT INTO "KanbanMovementLogs" ("companyId", "movedBy", reason, metadata, "createdAt")
            VALUES (:companyId, 'ai', :reason, :metadata, NOW())
          `, {
            replacements: {
              companyId,
              reason: `kanban_optimizer: ${rec.tagKey} timeLane ${rec.currentTimeLane}${rec.currentUnit} → ${rec.suggestedTimeLane}${rec.suggestedUnit}`,
              metadata: JSON.stringify(rec)
            },
            type: QueryTypes.INSERT
          });
        } catch {
          // No fallar por error de log
        }

        applied++;
      }
    }

    logger.info(
      `[TaskExecutor] kanban_optimizer company ${companyId}: ${stageAnalysis.length} etapas analizadas, ${recommendations.length} recomendaciones, ${applied} aplicadas`
    );

    return {
      success: true,
      result: {
        analyzedStages: stageAnalysis.length,
        recommendations,
        recommendationsCount: recommendations.length,
        appliedCount: applied,
        periodDays: days,
        autoApply,
      }
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return { success: false, error: `kanban_optimizer: ${message}` };
  }
};

/**
 * Handler: custom
 */
const handleCustom = async (taskId: number, companyId: number, config: Record<string, unknown>): Promise<TaskResult> => {
  logger.info(`[TaskExecutor] Tarea custom ${taskId} ejecutada para company ${companyId}`);
  return {
    success: true,
    result: { taskId, companyId, config, message: "Tarea custom ejecutada exitosamente" }
  };
};

/**
 * Ejecuta una tarea programada despachando al handler correspondiente.
 */
const executeTask = async (task: TaskInput): Promise<TaskResult> => {
  const { id, companyId, taskType, config } = task;

  logger.info(`[TaskExecutor] Ejecutando tarea ${id} (${taskType}) para company ${companyId}`);

  const handlers: Record<TaskType, () => Promise<TaskResult>> = {
    kb_refresh: () => handleKbRefresh(companyId, config),
    metrics_aggregation: () => handleMetricsAggregation(companyId, config),
    ticket_auto_index: () => handleTicketAutoIndex(companyId, config),
    rss_ingest: () => handleRssIngest(companyId, config),
    cache_cleanup: () => handleCacheCleanup(companyId, config),
    credit_reset: () => handleCreditReset(companyId),
    fine_tuning_check: () => handleFineTuningCheck(companyId),
    ab_test_evaluate: () => handleAbTestEvaluate(companyId),
    report_generate: () => handleReportGenerate(companyId, config),
    kanban_optimizer: () => handleKanbanOptimizer(companyId, config),
    custom: () => handleCustom(id, companyId, config)
  };

  const handler = handlers[taskType];
  if (!handler) {
    return { success: false, error: `Tipo de tarea desconocido: ${taskType}` };
  }

  try {
    const timeoutMs = task.timeoutMs || 300000; // Default: 5 minutos
    const result = await Promise.race([
      handler(),
      new Promise<TaskResult>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout: tarea ${id} (${taskType}) excedio ${timeoutMs}ms`)),
          timeoutMs
        )
      )
    ]);
    logger.info(`[TaskExecutor] Tarea ${id} (${taskType}) completada: success=${result.success}`);
    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    logger.error(`[TaskExecutor] Tarea ${id} (${taskType}) fallo: ${message}`);
    return { success: false, error: message };
  }
};

export default { executeTask };
