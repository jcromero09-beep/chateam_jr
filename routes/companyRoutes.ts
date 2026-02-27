import express from "express";
import isAuth from "../middleware/isAuth";
import  * as CompanyTokenUsageController from "../controllers/CompanyTokenUsageController";
import * as CompanyController from "../controllers/CompanyController";
const companyRoutes = express.Router();

companyRoutes.get("/companies/list", isAuth, CompanyController.list);
companyRoutes.get("/companies", isAuth, CompanyController.index);
companyRoutes.get("/companies/find", isAuth, CompanyController.showCompany);
companyRoutes.get("/companies/settings", isAuth, CompanyController.showCompany); // Alias para /companies/find
companyRoutes.get("/companies/:id", isAuth, CompanyController.show);
companyRoutes.post("/companies", isAuth, CompanyController.store);
companyRoutes.put("/companies/:id", isAuth, CompanyController.update);
companyRoutes.put("/companies/:id/schedules",isAuth,CompanyController.updateSchedules);
companyRoutes.delete("/companies/:id", isAuth, CompanyController.remove);
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
