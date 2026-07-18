import { Router } from 'express';
import DriveBackupController from '../controllers/DriveBackupController';
import isAuth from '../middleware/isAuth';

const router = Router();
const controller = new DriveBackupController();

router.get('/drive-backup/status', isAuth, (req, res) => controller.getStatus(req, res));
router.get('/drive-backup/auth-url', isAuth, (req, res) => controller.getAuthUrl(req, res));
router.get('/drive-backup/oauth-callback', (req, res) => controller.handleOAuthCallback(req, res)); // publico - OAuth Google
router.post('/drive-backup/run', isAuth, (req, res) => controller.runBackup(req, res));
router.get('/drive-backup/logs', isAuth, (req, res) => controller.getLogs(req, res));
router.delete('/drive-backup/disconnect', isAuth, (req, res) => controller.disconnect(req, res));

export default router;
