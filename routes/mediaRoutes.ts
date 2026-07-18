import { Router } from 'express';
import MediaController from '../controllers/MediaController';
import { tenantMiddleware, requireTenant } from '../middleware/tenantMiddleware';

const router = Router();
const mediaController = new MediaController();

// ==========================================
// MIDDLEWARE: Aplicar tenant y autenticación
// ==========================================
router.use(tenantMiddleware);
router.use(requireTenant);

// Middleware de autenticación (implementar según tu sistema)
// router.use(authMiddleware);

// ==========================================
// RUTAS DE UPLOAD
// ==========================================

/**
 * Genera URL presignada para upload
 * POST /api/media/upload-url
 */
router.post('/upload-url', async (req, res) => {
  await mediaController.generateUploadUrl(req, res);
});

/**
 * Confirma que el upload se completó
 * POST /api/media/:id/confirm
 */
router.post('/:id/confirm', async (req, res) => {
  await mediaController.confirmUpload(req, res);
});

/**
 * Upload directo (multipart/form-data)
 * POST /api/media/upload
 */
router.post('/upload', async (req, res) => {
  await mediaController.uploadDirect(req, res);
});

// ==========================================
// RUTAS DE CONSULTA
// ==========================================

/**
 * Lista de archivos
 * GET /api/media?status=active&page=1&limit=20
 */
router.get('/', async (req, res) => {
  await mediaController.getFiles(req, res);
});

/**
 * Estadísticas de uso
 * GET /api/media/stats
 */
router.get('/stats', async (req, res) => {
  await mediaController.getStats(req, res);
});

/**
 * Detalles de un archivo
 * GET /api/media/:id
 */
router.get('/:id', async (req, res) => {
  await mediaController.getFile(req, res);
});

/**
 * URL de descarga
 * GET /api/media/:id/download?expires=3600
 */
router.get('/:id/download', async (req, res) => {
  await mediaController.getDownloadUrl(req, res);
});

// ==========================================
// RUTAS DE GESTIÓN
// ==========================================

/**
 * Actualizar metadatos
 * PATCH /api/media/:id
 */
router.patch('/:id', async (req, res) => {
  await mediaController.updateFile(req, res);
});

/**
 * Eliminar archivo
 * DELETE /api/media/:id
 */
router.delete('/:id', async (req, res) => {
  await mediaController.deleteFile(req, res);
});

export default router;