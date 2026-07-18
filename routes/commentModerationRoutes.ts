// [Fase2·Ola H] Rutas de moderación de comentarios.
import { Router } from "express";
import isAuth from "../middleware/isAuth";
import * as C from "../controllers/CommentModerationController";

const r = Router();
r.get("/moderation/queue", isAuth, C.queue);
r.get("/moderation/queue/count", isAuth, C.pendingCount);
r.post("/moderation/:commentId/act", isAuth, C.act);
r.get("/moderation/:commentId/audit", isAuth, C.audit);
r.post("/moderation/classify", isAuth, C.classify);
r.get("/moderation/categories", isAuth, C.listCategories);
r.post("/moderation/categories", isAuth, C.upsertCategory);
export default r;
