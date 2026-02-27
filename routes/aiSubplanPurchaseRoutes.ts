import express from "express";
import isAuth from "../middleware/isAuth";
import * as AISubplanPurchaseController from "../controllers/AISubplanPurchaseController";

const routes = express.Router();

/**
 * Rutas para compra de subplans de tokens IA
 * Todas requieren autenticación
 */

// Obtener información de tokens de la empresa (balance y subplan activo)
routes.get("/token-info", isAuth, AISubplanPurchaseController.getCompanyTokenInfo);

// Listar subplans disponibles para compra (públicos y activos)
routes.get("/available", isAuth, AISubplanPurchaseController.listAvailableSubplans);

// Crear sesión de checkout de Stripe para comprar subplan
routes.post("/checkout", isAuth, AISubplanPurchaseController.createSubplanCheckout);

export default routes;
