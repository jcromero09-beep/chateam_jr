/**
 * Routes: Planes de Email
 *
 * Endpoints:
 * - GET /email-plans (público - listar planes disponibles)
 * - GET /email-plans/:id (público - ver plan específico)
 * - GET /email-plans/balance (auth - mi balance)
 * - GET /email-plans/usage (auth - mi uso)
 * - POST /email-plans (superadmin - crear plan)
 * - PUT /email-plans/:id (superadmin - actualizar plan)
 * - DELETE /email-plans/:id (superadmin - eliminar plan)
 * - POST /email-plans/provision (interno - provisionar créditos)
 */

import { Router } from "express";
import isAuth from "../middleware/isAuth";
import isSuperAdmin from "../middleware/isSuper";
import * as EmailPlanController from "../controllers/EmailPlanController";

const emailPlanRoutes = Router();

// ============================================================
// PÚBLICO - Listado de planes disponibles
// ============================================================
emailPlanRoutes.get("/email-plans", EmailPlanController.listEmailPlans);

// ============================================================
// AUTH - Company
// IMPORTANTE: estas rutas fijas ("balance"/"usage") DEBEN declararse
// ANTES de la paramétrica "/:id"; de lo contrario Express captura
// "balance"/"usage" como :id (Number("balance")=NaN) y responde 400.
// ============================================================
emailPlanRoutes.get("/email-plans/balance", isAuth, EmailPlanController.getEmailBalance);
emailPlanRoutes.get("/email-plans/usage", isAuth, EmailPlanController.getEmailUsage);

// ============================================================
// PÚBLICO - Plan específico (paramétrica: va DESPUÉS de las rutas fijas)
// ============================================================
emailPlanRoutes.get("/email-plans/:id", EmailPlanController.getEmailPlan);

// ============================================================
// SUPERADMIN - CRUD de planes
// ============================================================
emailPlanRoutes.post("/email-plans", isAuth, isSuperAdmin, EmailPlanController.createEmailPlan);
emailPlanRoutes.put("/email-plans/:id", isAuth, isSuperAdmin, EmailPlanController.updateEmailPlan);
emailPlanRoutes.delete("/email-plans/:id", isAuth, isSuperAdmin, EmailPlanController.deleteEmailPlan);

// ============================================================
// INTERNO - Provisionar créditos (llamado desde SubscriptionController)
// ============================================================
emailPlanRoutes.post("/email-plans/provision", EmailPlanController.provisionEmailCredits);

export default emailPlanRoutes;
