import express from "express";
import isAuth from "../middleware/isAuth";
import * as AITeamController from "../controllers/AITeamController";

const routes = express.Router();

// Rutas de consulta
routes.get("/ai/teams", isAuth, AITeamController.index);

// Rutas de administración
routes.post("/ai/teams", isAuth, AITeamController.store);
routes.put("/ai/teams/:id", isAuth, AITeamController.update);
routes.delete("/ai/teams/:id", isAuth, AITeamController.remove);

// Gestión de miembros
routes.post("/ai/teams/:teamId/members", isAuth, AITeamController.addMember);
routes.delete("/ai/teams/:teamId/members/:userId", isAuth, AITeamController.removeMember);

export default routes;
