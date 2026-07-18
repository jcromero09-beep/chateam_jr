import express from "express";
import isAuth from "../middleware/isAuth";
import * as AIObservabilityController from "../controllers/AIObservabilityController";

const routes = express.Router();

// Traces
routes.get("/ai/observability/traces", isAuth, AIObservabilityController.listTraces);
routes.get("/ai/observability/traces/:traceId", isAuth, AIObservabilityController.getTrace);

// Dashboard
routes.get("/ai/observability/dashboard", isAuth, AIObservabilityController.getDashboard);

// Stats
routes.get("/ai/observability/stats/latency", isAuth, AIObservabilityController.getLatencyStats);
routes.get("/ai/observability/stats/models", isAuth, AIObservabilityController.getModelUsage);
routes.get("/ai/observability/stats/agents", isAuth, AIObservabilityController.getAgentPerformance);
routes.get("/ai/observability/stats/errors", isAuth, AIObservabilityController.getErrorAnalysis);

export default routes;
