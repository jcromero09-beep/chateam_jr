import { Op } from "sequelize";
import AIScheduledTask from "../../models/AIScheduledTask";
import CronParserService from "./CronParserService";
import TaskExecutorService from "./TaskExecutorService";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

/**
 * SchedulerService — CRUD y ejecucion de tareas programadas IA.
 * Multi-tenancy: todas las operaciones (excepto getDueTasks/runDueTasks) filtran por companyId.
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
  | "custom";

interface CreateTaskData {
  name: string;
  description?: string;
  taskType: TaskType;
  cronExpression: string;
  config?: Record<string, unknown>;
  maxRetries?: number;
  timeoutMs?: number;
}

interface UpdateTaskData {
  name?: string;
  description?: string;
  taskType?: TaskType;
  cronExpression?: string;
  config?: Record<string, unknown>;
  status?: "active" | "paused" | "disabled" | "error";
  maxRetries?: number;
  timeoutMs?: number;
}

interface ListTasksFilters {
  taskType?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

interface RunDueResult {
  executed: number;
  errors: number;
}

/**
 * Crea una nueva tarea programada.
 */
const createTask = async (companyId: number, data: CreateTaskData): Promise<AIScheduledTask> => {
  // Validar cron
  const cronResult = CronParserService.parseExpression(data.cronExpression);
  if (!cronResult.valid) {
    throw new AppError(cronResult.error || "Expresion cron invalida", 400);
  }

  // Calcular proxima ejecucion
  const nextRunAt = CronParserService.getNextRun(data.cronExpression);

  const task = await AIScheduledTask.create({
    companyId,
    name: data.name,
    description: data.description || "",
    taskType: data.taskType,
    cronExpression: data.cronExpression,
    config: data.config || {},
    status: "active",
    nextRunAt,
    maxRetries: data.maxRetries ?? 3,
    timeoutMs: data.timeoutMs ?? 300000,
    totalRuns: 0,
    totalErrors: 0
  } as AIScheduledTask);

  logger.info(`[Scheduler] Tarea creada: ${task.id} (${data.taskType}) para company ${companyId}`);
  return task;
};

/**
 * Actualiza una tarea existente.
 */
const updateTask = async (
  taskId: number,
  companyId: number,
  data: UpdateTaskData
): Promise<AIScheduledTask> => {
  const task = await AIScheduledTask.findOne({
    where: { id: taskId, companyId }
  });

  if (!task) {
    throw new AppError("ERR_SCHEDULED_TASK_NOT_FOUND", 404);
  }

  // Si cambia la expresion cron, validar y recalcular nextRunAt
  if (data.cronExpression && data.cronExpression !== task.cronExpression) {
    const cronResult = CronParserService.parseExpression(data.cronExpression);
    if (!cronResult.valid) {
      throw new AppError(cronResult.error || "Expresion cron invalida", 400);
    }
    data.cronExpression = data.cronExpression;
  }

  const updatePayload: Record<string, unknown> = {};

  if (data.name !== undefined) updatePayload.name = data.name;
  if (data.description !== undefined) updatePayload.description = data.description;
  if (data.taskType !== undefined) updatePayload.taskType = data.taskType;
  if (data.config !== undefined) updatePayload.config = data.config;
  if (data.status !== undefined) updatePayload.status = data.status;
  if (data.maxRetries !== undefined) updatePayload.maxRetries = data.maxRetries;
  if (data.timeoutMs !== undefined) updatePayload.timeoutMs = data.timeoutMs;

  if (data.cronExpression) {
    updatePayload.cronExpression = data.cronExpression;
    updatePayload.nextRunAt = CronParserService.getNextRun(data.cronExpression);
  }

  await task.update(updatePayload);

  logger.info(`[Scheduler] Tarea actualizada: ${taskId} para company ${companyId}`);
  return task.reload();
};

/**
 * Elimina una tarea programada.
 */
const deleteTask = async (taskId: number, companyId: number): Promise<void> => {
  const task = await AIScheduledTask.findOne({
    where: { id: taskId, companyId }
  });

  if (!task) {
    throw new AppError("ERR_SCHEDULED_TASK_NOT_FOUND", 404);
  }

  await task.destroy();
  logger.info(`[Scheduler] Tarea eliminada: ${taskId} para company ${companyId}`);
};

/**
 * Pausa una tarea programada.
 */
const pauseTask = async (taskId: number, companyId: number): Promise<AIScheduledTask> => {
  const task = await AIScheduledTask.findOne({
    where: { id: taskId, companyId }
  });

  if (!task) {
    throw new AppError("ERR_SCHEDULED_TASK_NOT_FOUND", 404);
  }

  if (task.status === "paused") {
    throw new AppError("ERR_TASK_ALREADY_PAUSED", 400);
  }

  await task.update({ status: "paused" });
  logger.info(`[Scheduler] Tarea pausada: ${taskId} para company ${companyId}`);
  return task.reload();
};

/**
 * Reanuda una tarea pausada.
 */
const resumeTask = async (taskId: number, companyId: number): Promise<AIScheduledTask> => {
  const task = await AIScheduledTask.findOne({
    where: { id: taskId, companyId }
  });

  if (!task) {
    throw new AppError("ERR_SCHEDULED_TASK_NOT_FOUND", 404);
  }

  if (task.status === "active") {
    throw new AppError("ERR_TASK_ALREADY_ACTIVE", 400);
  }

  const nextRunAt = CronParserService.getNextRun(task.cronExpression);
  await task.update({ status: "active", nextRunAt });
  logger.info(`[Scheduler] Tarea reanudada: ${taskId} para company ${companyId}, proxima ejecucion: ${nextRunAt.toISOString()}`);
  return task.reload();
};

/**
 * Ejecuta manualmente una tarea, actualizando sus estadisticas.
 */
const runTask = async (taskId: number, companyId: number): Promise<{
  task: AIScheduledTask;
  result: { success: boolean; result?: Record<string, unknown>; error?: string };
}> => {
  const task = await AIScheduledTask.findOne({
    where: { id: taskId, companyId }
  });

  if (!task) {
    throw new AppError("ERR_SCHEDULED_TASK_NOT_FOUND", 404);
  }

  const startTime = Date.now();

  const execResult = await TaskExecutorService.executeTask({
    id: task.id,
    companyId: task.companyId,
    taskType: task.taskType as TaskType,
    config: task.config || {},
    timeoutMs: task.timeoutMs || 300000
  });

  const durationMs = Date.now() - startTime;
  const nextRunAt = CronParserService.getNextRun(task.cronExpression);

  const updatePayload: Record<string, unknown> = {
    lastRunAt: new Date(),
    lastRunDurationMs: durationMs,
    lastRunStatus: execResult.success ? "success" : "error",
    totalRuns: (task.totalRuns || 0) + 1,
    nextRunAt
  };

  if (!execResult.success) {
    updatePayload.lastRunError = execResult.error || "Error desconocido";
    updatePayload.totalErrors = (task.totalErrors || 0) + 1;
  } else {
    updatePayload.lastRunError = null;
  }

  await task.update(updatePayload);

  logger.info(`[Scheduler] Tarea ${taskId} ejecutada manualmente: ${execResult.success ? "OK" : "ERROR"} (${durationMs}ms)`);

  return { task: await task.reload(), result: execResult };
};

/**
 * Obtiene todas las tareas que deben ejecutarse ahora.
 * GLOBAL: no filtra por companyId.
 */
const getDueTasks = async (): Promise<AIScheduledTask[]> => {
  const tasks = await AIScheduledTask.findAll({
    where: {
      status: "active",
      nextRunAt: {
        [Op.lte]: new Date()
      }
    },
    order: [["nextRunAt", "ASC"]]
  });

  return tasks;
};

/**
 * Ejecuta todas las tareas pendientes.
 * GLOBAL: no filtra por companyId.
 */
const runDueTasks = async (): Promise<RunDueResult> => {
  const tasks = await getDueTasks();

  if (tasks.length === 0) {
    logger.info("[Scheduler] No hay tareas pendientes de ejecucion");
    return { executed: 0, errors: 0 };
  }

  logger.info(`[Scheduler] Ejecutando ${tasks.length} tareas pendientes`);

  let executed = 0;
  let errors = 0;

  for (const task of tasks) {
    const startTime = Date.now();

    try {
      const execResult = await TaskExecutorService.executeTask({
        id: task.id,
        companyId: task.companyId,
        taskType: task.taskType as TaskType,
        config: task.config || {}
      });

      const durationMs = Date.now() - startTime;
      const nextRunAt = CronParserService.getNextRun(task.cronExpression);

      const updatePayload: Record<string, unknown> = {
        lastRunAt: new Date(),
        lastRunDurationMs: durationMs,
        lastRunStatus: execResult.success ? "success" : "error",
        totalRuns: (task.totalRuns || 0) + 1,
        nextRunAt
      };

      if (!execResult.success) {
        updatePayload.lastRunError = execResult.error || "Error desconocido";
        updatePayload.totalErrors = (task.totalErrors || 0) + 1;
        errors++;
      } else {
        updatePayload.lastRunError = null;
      }

      await task.update(updatePayload);
      executed++;

      logger.info(`[Scheduler] Tarea ${task.id} (${task.taskType}): ${execResult.success ? "OK" : "ERROR"} (${durationMs}ms)`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Error desconocido";
      errors++;

      const durationMs = Date.now() - startTime;
      const nextRunAt = CronParserService.getNextRun(task.cronExpression);

      await task.update({
        lastRunAt: new Date(),
        lastRunDurationMs: durationMs,
        lastRunStatus: "error",
        lastRunError: message,
        totalRuns: (task.totalRuns || 0) + 1,
        totalErrors: (task.totalErrors || 0) + 1,
        nextRunAt
      });

      logger.error(`[Scheduler] Tarea ${task.id} (${task.taskType}) excepcion: ${message}`);
    }
  }

  logger.info(`[Scheduler] Resultado: ${executed} ejecutadas, ${errors} errores`);
  return { executed, errors };
};

/**
 * Lista tareas programadas con filtros y paginacion.
 */
const listTasks = async (
  companyId: number,
  filters: ListTasksFilters
): Promise<{ rows: AIScheduledTask[]; count: number }> => {
  const where: Record<string, unknown> = { companyId };

  if (filters.taskType) {
    where.taskType = filters.taskType;
  }
  if (filters.status) {
    where.status = filters.status;
  }

  const limit = filters.limit || 20;
  const offset = filters.offset || 0;

  const { rows, count } = await AIScheduledTask.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]]
  });

  return { rows, count };
};

/**
 * Obtiene una tarea individual por ID y companyId.
 */
const getTask = async (taskId: number, companyId: number): Promise<AIScheduledTask> => {
  const task = await AIScheduledTask.findOne({
    where: { id: taskId, companyId }
  });

  if (!task) {
    throw new AppError("ERR_SCHEDULED_TASK_NOT_FOUND", 404);
  }

  return task;
};

export default {
  createTask,
  updateTask,
  deleteTask,
  pauseTask,
  resumeTask,
  runTask,
  getDueTasks,
  runDueTasks,
  listTasks,
  getTask
};
