import { Router } from "express";
import isAuth from "../middleware/isAuth";
import isSuper from "../middleware/isSuper";
import * as FinancialDashboardController from "../controllers/FinancialDashboardController";

const financialRoutes = Router();

// Solo superadmin puede acceder a estas rutas
// Se usa el middleware isSuper para verificar que el usuario sea superadmin

// GET /financial/summary - Obtener resumen financiero
// Query params opcionales: month, year, recurrence, paymentMethod
financialRoutes.get("/financial/summary", isAuth, isSuper, FinancialDashboardController.summary);

// GET /financial/payments - Obtener pagos filtrados por período
// Query params: startDate, endDate, status, recurrence, paymentMethod, page, limit
financialRoutes.get("/financial/payments", isAuth, isSuper, FinancialDashboardController.payments);

// GET /financial/export - Exportar reporte financiero
// Query params: format (csv|json), startDate, endDate, status, recurrence, paymentMethod
financialRoutes.get("/financial/export", isAuth, isSuper, FinancialDashboardController.exportReport);

export default financialRoutes;
