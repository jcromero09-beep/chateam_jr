import express from "express";
import isAuth from "../middleware/isAuth";
import * as AIDashboardController from "../controllers/AIDashboardController";

const routes = express.Router();

// Dashboard widgets
routes.get("/ai/dashboard/widgets", isAuth, AIDashboardController.getAllWidgets);
routes.get("/ai/dashboard/widgets/:widgetId", isAuth, AIDashboardController.getWidget);

// Admin dashboard
routes.get("/ai/dashboard/admin", isAuth, AIDashboardController.getAdminDashboard);

// Metrics aggregation
routes.post("/ai/dashboard/aggregate", isAuth, AIDashboardController.triggerAggregation);

export default routes;
