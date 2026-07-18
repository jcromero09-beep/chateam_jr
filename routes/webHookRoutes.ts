import { Router } from "express";
import * as WebHooksController from "../controllers/WebHookController";
import * as MetaWebhookController from "../controllers/MetaWebhookController";
import * as WhatsAppController from "../controllers/WhatsAppController";
import * as FBPageWebhookController from "../controllers/FBPageWebhookController";
import isAuth from "../middleware/isAuth";
const webHooksRoutes = Router();

webHooksRoutes.get("/", WebHooksController.index);
webHooksRoutes.post("/", WebHooksController.webHook);

 webHooksRoutes.get("/metaws", MetaWebhookController.verifyMetaWebhook);
 webHooksRoutes.post("/metaws", MetaWebhookController.receiveMetaWebhook);
 webHooksRoutes.post("/meta", isAuth, WhatsAppController.storeMeta);

// Facebook Page Webhooks — Comment Auto-Reply
webHooksRoutes.get("/facebook", FBPageWebhookController.verify);
webHooksRoutes.post("/facebook", FBPageWebhookController.receive);

export default webHooksRoutes;
