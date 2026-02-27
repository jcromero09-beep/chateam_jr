import { Router } from "express";
import MCPController from "../controllers/MCPController";
import isAuth from "../middleware/isAuth";

const mcpRoutes = Router();
mcpRoutes.post("/responder-mcp", isAuth, MCPController.responder);

export default mcpRoutes;