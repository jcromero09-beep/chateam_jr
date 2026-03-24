import { Router } from "express";
import * as PromptController from "../controllers/PromptController";
import isAuth from "../middleware/isAuth";
import multer from "multer";
import uploadIAConfig from "../config/uploadIAConfig";
const promptRoutes = Router();
const upload = multer(uploadIAConfig);
promptRoutes.get("/prompt", isAuth, PromptController.index);

promptRoutes.post("/prompt", isAuth,upload.single("file"), PromptController.store);

promptRoutes.get("/prompt/:promptId", isAuth, PromptController.show);

promptRoutes.put("/prompt/:promptId", isAuth, upload.single("file"), PromptController.update);

promptRoutes.delete("/prompt/:promptId", isAuth, PromptController.remove);

export default promptRoutes;
// console.log("📄 PROMPT-ROUTER.TS LOADED\!");
