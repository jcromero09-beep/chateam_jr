import express from "express";
import isAuth from "../middleware/isAuth";
import multer from "multer";
import * as AISubplanPurchaseController from "../controllers/AISubplanPurchaseController";

const routes = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

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

// Crear orden de PayPal para comprar subplan
routes.post("/paypal", isAuth, AISubplanPurchaseController.createSubplanPaypalOrder);

// Procesar pago por comprobante (upload de archivo)
routes.post("/comprobante", isAuth, upload.single('file'), AISubplanPurchaseController.processSubplanComprobante);

export default routes;
