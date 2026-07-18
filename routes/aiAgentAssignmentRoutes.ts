import express from "express";
import isAuth from "../middleware/isAuth";
import * as AIAgentAssignmentController from "../controllers/AIAgentAssignmentController";

const routes = express.Router();

// CRUD de asignaciones de agentes IA a companies
routes.get("/ai/agents/assignments", isAuth, AIAgentAssignmentController.listAssignments);
routes.get("/ai/agents/assignments/available", isAuth, AIAgentAssignmentController.listAvailable);
routes.post("/ai/agents/assignments", isAuth, AIAgentAssignmentController.createAssignment);
routes.delete("/ai/agents/assignments/:id", isAuth, AIAgentAssignmentController.removeAssignment);

export default routes;
