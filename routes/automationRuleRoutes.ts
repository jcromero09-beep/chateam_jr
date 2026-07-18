import express from "express";
import isAuth from "../middleware/isAuth";
import * as AutomationRuleController from "../controllers/AutomationRuleController";

// [Fase E] Rutas del motor de reglas de ticket.
const automationRuleRoutes = express.Router();

automationRuleRoutes.get("/automation-rules", isAuth, AutomationRuleController.index);
automationRuleRoutes.get("/automation-rules/:id", isAuth, AutomationRuleController.show);
automationRuleRoutes.post("/automation-rules", isAuth, AutomationRuleController.store);
automationRuleRoutes.put("/automation-rules/:id", isAuth, AutomationRuleController.update);
automationRuleRoutes.delete("/automation-rules/:id", isAuth, AutomationRuleController.remove);

export default automationRuleRoutes;
