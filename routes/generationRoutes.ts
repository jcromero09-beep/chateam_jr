/**
 * Rutas NEUTRALES de generación de imagen/video con IA (spec §3).
 *
 *   GET  /api/generation/models
 *   GET  /api/generation/models/:id
 *   POST /api/generation/cost
 *   POST /api/generation/jobs
 *   GET  /api/generation/jobs/:id
 *   POST /api/generation/uploads        (multipart, campo "file")
 *   GET  /api/generation/characters
 *   POST /api/webhooks/higgsfield        (público — sin isAuth, verifica firma)
 */

import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import isAuth from "../middleware/isAuth";
import * as GenerationController from "../controllers/GenerationController";
import * as HiggsfieldWebhookController from "../controllers/HiggsfieldWebhookController";

const generationRoutes = Router();

// Multer: almacenamiento temporal de referencias en /public/company{id}/generation
const uploadDir = path.resolve(process.cwd(), "public", "tmp", "generation");
const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename(_req, file, cb) {
    const safe = file.originalname.replace(/[^\w.\-]/g, "_");
    cb(null, `${Date.now()}_${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// --- Endpoints autenticados ---
generationRoutes.get("/api/generation/models", isAuth, GenerationController.listModels);
generationRoutes.get(
  "/api/generation/models/:id",
  isAuth,
  GenerationController.getModelDetail
);
generationRoutes.post("/api/generation/cost", isAuth, GenerationController.estimateCost);
generationRoutes.post("/api/generation/debug", isAuth, GenerationController.debug);
generationRoutes.post("/api/generation/jobs", isAuth, GenerationController.createJob);
generationRoutes.get("/api/generation/jobs/:id", isAuth, GenerationController.getJob);
generationRoutes.post(
  "/api/generation/uploads",
  isAuth,
  upload.single("file"),
  GenerationController.uploadMedia
);
generationRoutes.get(
  "/api/generation/characters",
  isAuth,
  GenerationController.listCharacters
);

// --- Webhook público (verifica firma internamente) ---
generationRoutes.post(
  "/api/webhooks/higgsfield",
  HiggsfieldWebhookController.receive
);

export default generationRoutes;
