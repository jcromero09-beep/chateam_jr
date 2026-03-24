import express from "express";
import multer from "multer";
import uploadConfig from "../config/upload";
import isAuth from "../middleware/isAuth";

import * as EmailCampaignController from "../controllers/EmailCampaignController";
import * as EmailTemplateGalleryController from "../controllers/EmailTemplateGalleryController";

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

// Nuevos endpoints Email Marketing v2
emailCampaignRoutes.post("/email-campaigns/:id/send", isAuth, EmailCampaignController.send);
emailCampaignRoutes.post("/email-campaigns/test-send", isAuth, EmailCampaignController.testSend);
emailCampaignRoutes.get("/email-campaigns/:id/stats", isAuth, EmailCampaignController.stats);

// Email Templates CRUD
emailCampaignRoutes.get("/email-templates", isAuth, EmailCampaignController.indexTemplates);
emailCampaignRoutes.post("/email-templates", isAuth, EmailCampaignController.storeTemplate);

// Template Gallery (ANTES de :id para evitar conflicto de rutas)
emailCampaignRoutes.get("/email-templates/gallery", isAuth, EmailTemplateGalleryController.gallery);
emailCampaignRoutes.post("/email-templates/gallery/install", isAuth, EmailTemplateGalleryController.installPreset);

// AI Email Tools (ANTES de :id para evitar conflicto de rutas)
emailCampaignRoutes.post("/email-templates/ai/subject-lines", isAuth, EmailTemplateGalleryController.generateSubjectLines);
emailCampaignRoutes.post("/email-templates/ai/spam-score", isAuth, EmailTemplateGalleryController.analyzeSpamScore);
emailCampaignRoutes.post("/email-templates/ai/generate", isAuth, EmailTemplateGalleryController.generateContent);

// Email Templates por ID (DESPUES de rutas especificas)
emailCampaignRoutes.get("/email-templates/:id", isAuth, EmailCampaignController.showTemplate);
emailCampaignRoutes.put("/email-templates/:id", isAuth, EmailCampaignController.updateTemplate);
emailCampaignRoutes.delete("/email-templates/:id", isAuth, EmailCampaignController.removeTemplate);

export default emailCampaignRoutes;
