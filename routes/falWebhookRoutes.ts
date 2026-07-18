import { Router } from "express";
import * as FalWebhookController from "../controllers/FalWebhookController";

const routes = Router();

routes.post("/api/fal/webhook", FalWebhookController.receive);

export default routes;
