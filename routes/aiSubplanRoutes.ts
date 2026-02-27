import express from "express";
import isAuth from "../middleware/isAuth";
import isSuper from "../middleware/isSuper";
import * as AISubplanController from "../controllers/AISubplanController";

const aiSubplanRoutes = express.Router();

// ==================== SUBPLANS ROUTES ====================

// Listar todos los subplanes de IA (solo superadmin)
aiSubplanRoutes.get("/subplans", isAuth, isSuper, AISubplanController.listSubplans);

// Listar subplanes públicos (para compra) - accesible para todos
aiSubplanRoutes.get("/subplans/public", isAuth, AISubplanController.listPublicSubplans);

// Obtener un subplan específico (solo superadmin)
aiSubplanRoutes.get("/subplans/:id", isAuth, isSuper, AISubplanController.getSubplan);

// Crear nuevo subplan (solo superadmin)
aiSubplanRoutes.post("/subplans", isAuth, isSuper, AISubplanController.createSubplan);

// Actualizar subplan (solo superadmin)
aiSubplanRoutes.put("/subplans/:id", isAuth, isSuper, AISubplanController.updateSubplan);

// Eliminar subplan (solo superadmin)
aiSubplanRoutes.delete("/subplans/:id", isAuth, isSuper, AISubplanController.deleteSubplan);

export default aiSubplanRoutes;
