import { Router } from "express";
import isAuth from "../middleware/isAuth";
import isSuper from "../middleware/isSuper";
import * as AITokenUsageAdminController from "../controllers/AITokenUsageAdminController";

const routes = Router();

routes.get(
  "/admin/ai-token-usage",
  isAuth,
  isSuper,
  AITokenUsageAdminController.index
);

routes.get(
  "/admin/ai-token-usage/filters",
  isAuth,
  isSuper,
  AITokenUsageAdminController.filterOptions
);

export default routes;
