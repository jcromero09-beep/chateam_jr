import express from "express";
import isAuth from "../middleware/isAuth";
import isSuper from "../middleware/isSuper";
import * as AIConfigController from "../controllers/AIConfigController";

const aiConfigRoutes = express.Router();

// ==================== PROVIDER CONFIG ROUTES ====================

// Listar todos los proveedores de IA configurados (solo superadmin)
aiConfigRoutes.get("/providers", isAuth, isSuper, AIConfigController.listProviders);

// Obtener un proveedor especifico (solo superadmin)
aiConfigRoutes.get("/providers/:id", isAuth, isSuper, AIConfigController.getProvider);

// Crear nueva configuracion de proveedor (solo superadmin)
aiConfigRoutes.post("/providers", isAuth, isSuper, AIConfigController.createProvider);

// Actualizar configuracion de proveedor (solo superadmin)
aiConfigRoutes.put("/providers/:id", isAuth, isSuper, AIConfigController.updateProvider);

// Eliminar configuracion de proveedor (solo superadmin)
aiConfigRoutes.delete("/providers/:id", isAuth, isSuper, AIConfigController.deleteProvider);

// Probar conexion con proveedor (solo superadmin)
aiConfigRoutes.post("/providers/:id/test", isAuth, isSuper, AIConfigController.testConnection);

// ==================== PROMPT TEMPLATES ROUTES ====================

// Listar plantillas de prompts (solo superadmin)
aiConfigRoutes.get("/templates", isAuth, isSuper, AIConfigController.listPromptTemplates);

// Crear plantilla de prompt (solo superadmin)
aiConfigRoutes.post("/templates", isAuth, isSuper, AIConfigController.createPromptTemplate);

// Actualizar plantilla de prompt (solo superadmin)
aiConfigRoutes.put("/templates/:id", isAuth, isSuper, AIConfigController.updatePromptTemplate);

// Eliminar plantilla de prompt (solo superadmin)
aiConfigRoutes.delete("/templates/:id", isAuth, isSuper, AIConfigController.deletePromptTemplate);

// ==================== ANALYTICS ROUTES ====================

// Obtener estadisticas de uso (solo superadmin)
aiConfigRoutes.get("/analytics", isAuth, isSuper, AIConfigController.getAnalytics);

// ==================== MODELS ROUTES ====================

// Obtener modelos disponibles para un proveedor (accesible para todos)
aiConfigRoutes.get("/models/:provider", isAuth, AIConfigController.getAvailableModels);

export default aiConfigRoutes;
console.log("📄 AI-CONFIG-ROUTES.TS LOADED\!");
