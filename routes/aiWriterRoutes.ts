import express from "express";
import isAuth from "../middleware/isAuth";
import * as AIWriterController from "../controllers/AIWriterController";

const routes = express.Router();

// AI Writer
routes.post("/ai/writer/generate", isAuth, AIWriterController.generate);
routes.post("/ai/writer/variants", isAuth, AIWriterController.variants);
routes.post("/ai/writer/rewrite", isAuth, AIWriterController.rewrite);

// Campaign Wizard
routes.post("/ai/campaign-wizard/suggest", isAuth, AIWriterController.wizardSuggest);
routes.post("/ai/campaign-wizard/variants", isAuth, AIWriterController.wizardVariants);
routes.post("/ai/campaign-wizard/image-prompt", isAuth, AIWriterController.wizardImagePrompt);
routes.post("/ai/campaign-wizard/analyze", isAuth, AIWriterController.wizardAnalyze);

export default routes;
