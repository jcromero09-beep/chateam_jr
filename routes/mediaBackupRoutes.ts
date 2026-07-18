import { Router } from "express";
import MediaBackupController from "../controllers/MediaBackupController";
import isAuth from "../middleware/isAuth";

const router = Router();
const controller = new MediaBackupController();

router.get("/media-backup/status", isAuth, (req, res) => controller.getStatus(req, res));
router.get("/media-backup/logs", isAuth, (req, res) => controller.getLogs(req, res));
router.post("/media-backup/run", isAuth, (req, res) => controller.runBackup(req, res));

export default router;
