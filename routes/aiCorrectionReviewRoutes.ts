/**
 * Rutas del panel de revisión humana de correcciones.
 *
 * Sprint 1 (2026-05-20) — Loop de Aprendizaje desde Correcciones Humanas.
 *
 * Todas las rutas requieren autenticación. La autorización fina por
 * permiso (ai.correctionReview.{view,approve,reject}) se hace en el
 * frontend con permisos RBAC; el backend confía en isAuth + companyId.
 */
import express from "express";
import isAuth from "../middleware/isAuth";
import * as AICorrectionReviewController from "../controllers/AICorrectionReviewController";

const router = express.Router();

router.get("/ai/correction-review", isAuth, AICorrectionReviewController.index);
router.get("/ai/correction-review/stats", isAuth, AICorrectionReviewController.stats);
router.get("/ai/correction-review/:id", isAuth, AICorrectionReviewController.show);
router.post("/ai/correction-review/:id/approve", isAuth, AICorrectionReviewController.approve);
router.post("/ai/correction-review/:id/reject", isAuth, AICorrectionReviewController.reject);
router.post("/ai/correction-review/bulk-approve", isAuth, AICorrectionReviewController.bulkApprove);

export default router;
