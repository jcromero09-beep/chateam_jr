import express from "express";
import isAuth from "../middleware/isAuth";
import * as AISchedulerController from "../controllers/AISchedulerController";

const routes = express.Router();

// Tareas programadas — CRUD
routes.post("/ai/scheduler/tasks", isAuth, AISchedulerController.createTask);
routes.get("/ai/scheduler/tasks", isAuth, AISchedulerController.listTasks);

// Ejecutar tareas pendientes (global, admin only) — ANTES de /:taskId
routes.post("/ai/scheduler/run-due", isAuth, AISchedulerController.runDueTasks);

// Operaciones por tarea individual
routes.get("/ai/scheduler/tasks/:taskId", isAuth, AISchedulerController.getTask);
routes.put("/ai/scheduler/tasks/:taskId", isAuth, AISchedulerController.updateTask);
routes.delete("/ai/scheduler/tasks/:taskId", isAuth, AISchedulerController.deleteTask);
routes.post("/ai/scheduler/tasks/:taskId/pause", isAuth, AISchedulerController.pauseTask);
routes.post("/ai/scheduler/tasks/:taskId/resume", isAuth, AISchedulerController.resumeTask);
routes.post("/ai/scheduler/tasks/:taskId/run", isAuth, AISchedulerController.runTask);

export default routes;
