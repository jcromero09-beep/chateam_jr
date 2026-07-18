import { Router } from "express";
import isAuth from "../middleware/isAuth";

import * as QueueController from "../controllers/QueueController";

const queueRoutes = Router();

// Rutas singulares (originales)
queueRoutes.get("/queue", isAuth, QueueController.index);
queueRoutes.post("/queue", isAuth, QueueController.store);
queueRoutes.get("/queue/:queueId", isAuth, QueueController.show);
queueRoutes.put("/queue/:queueId", isAuth, QueueController.update);
queueRoutes.delete("/queue/:queueId", isAuth, QueueController.remove);

// Alias plurales (para compatibilidad con frontend)
queueRoutes.get("/queues", isAuth, QueueController.index);
queueRoutes.post("/queues", isAuth, QueueController.store);
queueRoutes.get("/queues/:queueId", isAuth, QueueController.show);
queueRoutes.put("/queues/:queueId", isAuth, QueueController.update);
queueRoutes.delete("/queues/:queueId", isAuth, QueueController.remove);

export default queueRoutes;
