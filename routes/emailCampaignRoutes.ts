import express from "express";
import multer from "multer";
import uploadConfig from "../config/upload";
import isAuth from "../middleware/isAuth";

import * as EmailCampaignController from "../controllers/EmailCampaignController";

const emailCampaignRoutes = express.Router();
const upload = multer(uploadConfig);

emailCampaignRoutes.get("/email-campaigns", isAuth, EmailCampaignController.index);
emailCampaignRoutes.post("/email-campaigns", isAuth, EmailCampaignController.store);
emailCampaignRoutes.post("/email-campaigns/create-and-launch", isAuth, EmailCampaignController.createAndLaunch);
emailCampaignRoutes.get("/email-campaigns/:id", isAuth, EmailCampaignController.show);
emailCampaignRoutes.put("/email-campaigns/:id", isAuth, EmailCampaignController.update);
emailCampaignRoutes.delete("/email-campaigns/:id", isAuth, EmailCampaignController.remove);

emailCampaignRoutes.post(
  "/email-campaigns/:id/media-upload",
  isAuth,
  upload.array("file"),
  EmailCampaignController.mediaUpload
);

emailCampaignRoutes.delete(
  "/email-campaigns/:id/media-upload",
  isAuth,
  EmailCampaignController.deleteMedia
);

emailCampaignRoutes.post("/email-campaigns/:id/cancel", isAuth, EmailCampaignController.cancel);
emailCampaignRoutes.post("/email-campaigns/:id/restart", isAuth, EmailCampaignController.restart);

// Email Templates CRUD
emailCampaignRoutes.get("/email-templates", isAuth, EmailCampaignController.indexTemplates);
emailCampaignRoutes.post("/email-templates", isAuth, EmailCampaignController.storeTemplate);
emailCampaignRoutes.get("/email-templates/:id", isAuth, EmailCampaignController.showTemplate);
emailCampaignRoutes.put("/email-templates/:id", isAuth, EmailCampaignController.updateTemplate);
emailCampaignRoutes.delete("/email-templates/:id", isAuth, EmailCampaignController.removeTemplate);

export default emailCampaignRoutes;
