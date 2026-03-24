import express from "express";
import isAuth from "../middleware/isAuth";
import * as AIFineTuningController from "../controllers/AIFineTuningController";

const routes = express.Router();

// Static routes MUST come before parameterized routes to avoid conflicts
routes.get("/ai/fine-tuning/data-sources", isAuth, AIFineTuningController.listDataSources);
routes.get("/ai/fine-tuning/jobs/models", isAuth, AIFineTuningController.listModels);
routes.post("/ai/fine-tuning/jobs/prepare-dataset", isAuth, AIFineTuningController.prepareDataset);

// CRUD & list
routes.post("/ai/fine-tuning/jobs", isAuth, AIFineTuningController.createJob);
routes.get("/ai/fine-tuning/jobs", isAuth, AIFineTuningController.listJobs);

// Parameterized routes
routes.get("/ai/fine-tuning/jobs/:jobId", isAuth, AIFineTuningController.getJob);
routes.post("/ai/fine-tuning/jobs/:jobId/cancel", isAuth, AIFineTuningController.cancelJob);
routes.get("/ai/fine-tuning/jobs/:jobId/events", isAuth, AIFineTuningController.getJobEvents);

export default routes;
