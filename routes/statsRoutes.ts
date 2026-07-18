// [Fase2·Ola D] Rutas del motor estadístico.
import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as StatsController from "../controllers/StatsController";

const statsRoutes = Router();

statsRoutes.post("/stats/run", isAuth, StatsController.runNow);
statsRoutes.get("/stats/recommendations", isAuth, StatsController.listRecommendations);
statsRoutes.put("/stats/recommendations/:id", isAuth, StatsController.updateRecommendation);
statsRoutes.get("/stats/accuracy", isAuth, StatsController.accuracy);

export default statsRoutes;
