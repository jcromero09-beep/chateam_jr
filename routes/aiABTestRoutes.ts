import express from "express";
import isAuth from "../middleware/isAuth";
import * as AIABTestController from "../controllers/AIABTestController";

const routes = express.Router();

// A/B Testing para prompts IA
routes.post("/ai/ab-tests", isAuth, AIABTestController.createTest);
routes.get("/ai/ab-tests", isAuth, AIABTestController.listTests);
routes.get("/ai/ab-tests/:testId", isAuth, AIABTestController.getTest);
routes.post("/ai/ab-tests/:testId/start", isAuth, AIABTestController.startTest);
routes.post("/ai/ab-tests/:testId/pause", isAuth, AIABTestController.pauseTest);
routes.post("/ai/ab-tests/:testId/evaluate", isAuth, AIABTestController.evaluateTest);
routes.post("/ai/ab-tests/variants/:variantId/result", isAuth, AIABTestController.recordResult);

export default routes;
