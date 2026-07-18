import express from "express";
import isAuth from "../middleware/isAuth";
import isSuper from "../middleware/isSuper";
import  * as CompanyTokenUsageController from "../controllers/CompanyTokenUsageController";
import * as ImpersonationController from "../controllers/ImpersonationController";
import * as SwitchCompanyController from "../controllers/SwitchCompanyController";
import * as MembershipController from "../controllers/MembershipController";
import * as CompanyController from "../controllers/CompanyController";
const companyRoutes = express.Router();

companyRoutes.get("/companies/list", isAuth, CompanyController.list);
companyRoutes.get("/companies", isAuth, CompanyController.index);
companyRoutes.get("/companies/find", isAuth, CompanyController.showCompany);
companyRoutes.get("/companies/settings", isAuth, CompanyController.showCompany); // Alias para /companies/find
companyRoutes.get("/companies/:id", isAuth, CompanyController.show);
// [Sonda super-admin 2026-07] Crear empresas es solo del super. Antes iba con isAuth
// a secas y el controller.store nunca revisaba req.user.super → cualquier usuario
// autenticado podía crear empresas (con admin/whatsapp/cola/flujo). GET/PUT/DELETE ya
// validan super dentro del controller; el POST no. Se cierra con isSuper.
companyRoutes.post("/companies", isAuth, isSuper, CompanyController.store);
companyRoutes.put("/companies/:id", isAuth, CompanyController.update);
companyRoutes.put("/companies/:id/schedules",isAuth,CompanyController.updateSchedules);
companyRoutes.delete("/companies/:id", isAuth, CompanyController.remove);

// [Super/Impersonación] Entrar/salir de una empresa (solo super).
companyRoutes.post("/companies/:id/enter", isAuth, ImpersonationController.enter);
companyRoutes.post("/companies/exit", isAuth, ImpersonationController.exit);
// [Multi-empresa] Empresas del usuario (membresías) + cambiar de empresa activa.
companyRoutes.get("/my-companies", isAuth, SwitchCompanyController.myCompanies);
companyRoutes.post("/switch-company/:id", isAuth, SwitchCompanyController.switchCompany);
// [Multi-empresa · F4.1] Gestión de miembros de una empresa (admin/super).
companyRoutes.get("/companies/:companyId/members", isAuth, MembershipController.index);
companyRoutes.post("/companies/:companyId/members", isAuth, MembershipController.store);
companyRoutes.put("/companies/:companyId/members/:userId", isAuth, MembershipController.update);
companyRoutes.delete("/companies/:companyId/members/:userId", isAuth, MembershipController.remove);
// Rota para listar o plano da empresa
companyRoutes.get("/companies/listPlan/:id", isAuth, CompanyController.listPlan);
companyRoutes.get("/companiesPlan", isAuth, CompanyController.indexPlan);
// Listar uso de tokens de una empresa para un mes específico
companyRoutes.get(
    "/companies/month",
    isAuth,
    CompanyTokenUsageController.indexByMonth
  );

  // Listar historial mensual de una empresa
  companyRoutes.get(
    "/companies/history",
    isAuth,
    CompanyTokenUsageController.indexHistory
  );

// Rutas alternativas para compatibilidad con frontend (sin "s")
companyRoutes.get("/company/month", isAuth, CompanyTokenUsageController.indexByMonth);
companyRoutes.get("/company/history", isAuth, CompanyTokenUsageController.indexHistory);

// Dashboard de estadísticas OpenAI
companyRoutes.get("/company/token-stats", isAuth, CompanyTokenUsageController.dashboardStats);
companyRoutes.get("/openai/dashboard-stats", isAuth, CompanyTokenUsageController.dashboardStats);

export default companyRoutes;
