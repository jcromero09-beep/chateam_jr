// [Fase3·N2.0] Rutas de Roles.
import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as RoleController from "../controllers/RoleController";

const roleRoutes = Router();

roleRoutes.get("/roles", isAuth, RoleController.index);
roleRoutes.get("/roles/seats", isAuth, RoleController.seats);
roleRoutes.post("/roles", isAuth, RoleController.store);
roleRoutes.put("/roles/:id", isAuth, RoleController.update);
roleRoutes.delete("/roles/:id", isAuth, RoleController.remove);

export default roleRoutes;
