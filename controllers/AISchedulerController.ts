import { Request, Response } from "express";
import SchedulerService from "../services/AISchedulerServices/SchedulerService";
import CronParserService from "../services/AISchedulerServices/CronParserService";
import AppError from "../errors/AppError";

/**
 * AISchedulerController — Endpoints para gestion de tareas programadas IA.
 */

// POST /ai/scheduler/tasks — Crear tarea programada
export const createTask = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { name, description, taskType, cronExpression, config, maxRetries, timeoutMs } = req.body;

  if (!name || !taskType || !cronExpression) {
    throw new AppError("ERR_MISSING_REQUIRED_FIELDS", 400);
  }

  const task = await SchedulerService.createTask(companyId, {
    name,
    description,
    taskType,
    cronExpression,
    config,
    maxRetries,
    timeoutMs
  });

  return res.status(201).json({ success: true, data: task });
};

// GET /ai/scheduler/tasks — Listar tareas programadas
export const listTasks = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { taskType, status, limit, offset } = req.query as Record<string, string | undefined>;

  const result = await SchedulerService.listTasks(companyId, {
    taskType,
    status,
    limit: limit ? parseInt(limit, 10) : undefined,
    offset: offset ? parseInt(offset, 10) : undefined
  });

  return res.json({
    success: true,
    data: result.rows,
    pagination: {
      total: result.count,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0
    }
  });
};

// GET /ai/scheduler/tasks/:taskId — Obtener tarea individual
export const getTask = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { taskId } = req.params;

  const task = await SchedulerService.getTask(parseInt(taskId, 10), companyId);

  // Agregar descripcion legible del cron
  const cronDescription = CronParserService.getDescription(task.cronExpression);

  return res.json({
    success: true,
    data: {
      ...task.toJSON(),
      cronDescription
    }
  });
};

// PUT /ai/scheduler/tasks/:taskId — Actualizar tarea
export const updateTask = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { taskId } = req.params;
  const { name, description, taskType, cronExpression, config, status, maxRetries, timeoutMs } = req.body;

  const task = await SchedulerService.updateTask(parseInt(taskId, 10), companyId, {
    name,
    description,
    taskType,
    cronExpression,
    config,
    status,
    maxRetries,
    timeoutMs
  });

  return res.json({ success: true, data: task });
};

// DELETE /ai/scheduler/tasks/:taskId — Eliminar tarea
export const deleteTask = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { taskId } = req.params;

  await SchedulerService.deleteTask(parseInt(taskId, 10), companyId);

  return res.json({ success: true, message: "Tarea eliminada exitosamente" });
};

// POST /ai/scheduler/tasks/:taskId/pause — Pausar tarea
export const pauseTask = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { taskId } = req.params;

  const task = await SchedulerService.pauseTask(parseInt(taskId, 10), companyId);

  return res.json({ success: true, data: task });
};

// POST /ai/scheduler/tasks/:taskId/resume — Reanudar tarea
export const resumeTask = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { taskId } = req.params;

  const task = await SchedulerService.resumeTask(parseInt(taskId, 10), companyId);

  return res.json({ success: true, data: task });
};

// POST /ai/scheduler/tasks/:taskId/run — Ejecucion manual
export const runTask = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { taskId } = req.params;

  const { task, result } = await SchedulerService.runTask(parseInt(taskId, 10), companyId);

  return res.json({
    success: true,
    data: {
      task,
      execution: result
    }
  });
};

// POST /ai/scheduler/run-due — Ejecutar todas las tareas pendientes (cron externo)
export const runDueTasks = async (req: Request, res: Response): Promise<Response> => {
  const { profile } = req.user;

  // Solo admin puede ejecutar tareas globales
  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const result = await SchedulerService.runDueTasks();

  return res.json({
    success: true,
    data: result
  });
};
