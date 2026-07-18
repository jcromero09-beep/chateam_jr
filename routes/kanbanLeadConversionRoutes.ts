import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as KanbanLeadConversionController from "../controllers/KanbanLeadConversionController";

const router = Router();

// Listado paginado con filtros y búsqueda global
router.get(
  "/kanban-lead-conversions",
  isAuth,
  KanbanLeadConversionController.index
);

// KPIs / resumen agregado por estado
router.get(
  "/kanban-lead-conversions/stats",
  isAuth,
  KanbanLeadConversionController.stats
);

// Detalle de un evento
router.get(
  "/kanban-lead-conversions/:id",
  isAuth,
  KanbanLeadConversionController.show
);

// Reintento manual de un evento failed
router.post(
  "/kanban-lead-conversions/:id/retry",
  isAuth,
  KanbanLeadConversionController.retry
);

export default router;
