import express from "express";
import isAuth from "../middleware/isAuth";

import * as PlanController from "../controllers/PlanController";

const planRoutes = express.Router();

planRoutes.get("/plans", isAuth, PlanController.index);
planRoutes.get("/plans/list", PlanController.list);
planRoutes.get("/plans/all", isAuth, PlanController.list);
planRoutes.get("/plans/:id", isAuth, PlanController.show);
planRoutes.post("/plans", isAuth, PlanController.store);
planRoutes.put("/plans/:id", isAuth, PlanController.update);
planRoutes.delete("/plans/:id", isAuth, PlanController.remove);

// Rutas de permisos de interfaz (solo superadmin)
planRoutes.get("/plans/:id/permissions", isAuth, PlanController.getInterfacePermissions);
planRoutes.put("/plans/:id/permissions", isAuth, PlanController.updateInterfacePermissions);

export default planRoutes;
