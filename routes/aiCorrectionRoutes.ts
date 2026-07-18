import express from "express";
import isAuth from "../middleware/isAuth";
import * as CorrectionController from "../controllers/AISupportCorrectionController";

const router = express.Router();

// ── Correcciones/Soluciones ────────────────────────────────────
router.get("/ai/corrections", isAuth, CorrectionController.index);
router.post("/ai/corrections", isAuth, CorrectionController.store);
router.put("/ai/corrections/:id", isAuth, CorrectionController.update);
router.delete("/ai/corrections/:id", isAuth, CorrectionController.remove);

// ── Memorias Aprendidas ─────────────────────────────────────────
router.get("/ai/memories", isAuth, CorrectionController.listMemories);
router.put("/ai/memories/:id", isAuth, CorrectionController.updateMemory);
router.delete("/ai/memories/:id", isAuth, CorrectionController.deleteMemory);

export default router;
