import { Router } from "express";
import isAuth from "../middleware/isAuth";
import isSuper from "../middleware/isSuper";
import * as UGCSettingsController from "../controllers/UGCSettingsController";

const ugcSettingsRoutes = Router();

ugcSettingsRoutes.get("/ugc/settings", isAuth, isSuper, UGCSettingsController.show);
ugcSettingsRoutes.put("/ugc/settings", isAuth, isSuper, UGCSettingsController.update);
ugcSettingsRoutes.post("/ugc/settings/test-fal", isAuth, isSuper, UGCSettingsController.testFal);

export default ugcSettingsRoutes;
