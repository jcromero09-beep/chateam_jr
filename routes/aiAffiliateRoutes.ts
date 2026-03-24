import express from "express";
import isAuth from "../middleware/isAuth";
import * as AIAffiliateController from "../controllers/AIAffiliateController";

const routes = express.Router();

routes.get("/ai/affiliates", isAuth, AIAffiliateController.show);
routes.get("/ai/affiliates/programs", isAuth, AIAffiliateController.show); // Alias para frontend
routes.post("/ai/affiliates", isAuth, AIAffiliateController.store);
routes.post("/ai/affiliates/programs", isAuth, AIAffiliateController.store); // Alias para frontend
routes.get("/ai/affiliates/stats", isAuth, AIAffiliateController.stats);
routes.post("/ai/affiliates/:id/activate", isAuth, AIAffiliateController.activate);
routes.post("/ai/affiliates/:id/deactivate", isAuth, AIAffiliateController.deactivate);

export default routes;
