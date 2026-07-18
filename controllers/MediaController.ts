import { Request, Response } from 'express';
import Media from '../models/Media';
import FileLifecycleService from '../services/FileLifecycleService';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

/**
 * Controller para gestión de archivos multimedia
 */
export class MediaController {
  private fileService: FileLifecycleService;

  constructor() {
    this.fileService = new FileLifecycleService();
  }

  /**
   * Genera URL presignada para upload
   * POST /api/media/upload-url
   */
  async generateUploadUrl(req: Request, res: Response): Promise<void> {
    try {
      const { originalName, mimeType, sizeBytes, retentionDays, tags, metadata } = req.body;
      const companyId = req.tenant?.id || 1; // Usar tenant del middleware
      const userId = req.user?.id || 1; // Asumir usuario autenticado

      // Validaciones
      if (!originalName || !mimeType || !sizeBytes) {
        res.status(400).json({
          error: 'Missing required fields: originalName, mimeType, sizeBytes'
        });
        return;
      }

      const result = await this.fileService.generateUploadUrl(
        originalName,
        mimeType,
        sizeBytes,
        {
          companyId,
          userId,
          retentionDays,
          tags,
          metadata
        }
      );

      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(201).json({
        mediaId: result.media.id,
        uploadUrl: result.uploadUrl,
        expiresAt: result.media.expires_at,
        storageKey: result.media.storage_key
      });
    } catch (error) {
      console.error('Error generating upload URL:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Confirma upload completado
   * POST /api/media/:id/confirm
   */
  async confirmUpload(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const success = await this.fileService.confirmUpload(id);

      if (!success) {
        res.status(404).json({ error: 'Media not found or upload failed' });
        return;
      }

      const media = await Media.findByPk(id);
      res.status(200).json({
        id: media!.id,
        url: media!.url,
        thumbnailUrl: media!.thumbnail_url,
        status: media!.status
      });
    } catch (error) {
      console.error('Error confirming upload:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Upload directo de archivo
   * POST /api/media/upload
   */
  async uploadDirect(req: Request, res: Response): Promise<void> {
    try {
      const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
          fileSize: parseInt(process.env.MAX_FILE_SIZE_BYTES || '52428800') // 50MB
        }
      }).single('file');

      upload(req, res, async (err) => {
        if (err) {
          res.status(400).json({ error: err.message });
          return;
        }

        if (!req.file) {
          res.status(400).json({ error: 'No file provided' });
          return;
        }

        const companyId = req.tenant?.id || 1;
        const userId = req.user?.id || 1;

        const result = await this.fileService.uploadBuffer(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
          {
            companyId,
            userId,
            retentionDays: parseInt(req.body.retentionDays || '30'),
            tags: req.body.tags ? JSON.parse(req.body.tags) : [],
            metadata: req.body.metadata ? JSON.parse(req.body.metadata) : {}
          }
        );

        if (result.error) {
          res.status(400).json({ error: result.error });
          return;
        }

        res.status(201).json({
          id: result.media.id,
          originalName: result.media.original_name,
          url: result.media.url,
          thumbnailUrl: result.media.thumbnail_url,
          size: result.media.getFormattedSize(),
          expiresAt: result.media.expires_at
        });
      });
    } catch (error) {
      console.error('Error in direct upload:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Obtiene lista de archivos
   * GET /api/media
   */
  async getFiles(req: Request, res: Response): Promise<void> {
    try {
      const companyId = req.tenant?.id || 1;
      const { status, page = 1, limit = 20 } = req.query;

      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

      const result = await Media.getByCompany(companyId, {
        status: status as string,
        limit: parseInt(limit as string),
        offset
      });

      res.status(200).json({
        files: result.files.map(file => ({
          id: file.id,
          originalName: file.original_name,
          mimeType: file.mime_type,
          size: file.getFormattedSize(),
          url: file.url,
          thumbnailUrl: file.thumbnail_url,
          status: file.status,
          expiresAt: file.expires_at,
          createdAt: file.created_at,
          tags: file.tags,
          isExpired: file.isExpired()
        })),
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total: result.total,
          pages: Math.ceil(result.total / parseInt(limit as string))
        }
      });
    } catch (error) {
      console.error('Error getting files:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Obtiene un archivo específico
   * GET /api/media/:id
   */
  async getFile(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const companyId = req.tenant?.id || 1;

      const media = await Media.findOne({
        where: {
          id,
          company_id: companyId
        }
      });

      if (!media) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      res.status(200).json({
        id: media.id,
        originalName: media.original_name,
        filename: media.filename,
        mimeType: media.mime_type,
        size: media.getFormattedSize(),
        sizeBytes: media.size_bytes,
        url: media.url,
        thumbnailUrl: media.thumbnail_url,
        status: media.status,
        expiresAt: media.expires_at,
        notifiedAt: media.notified_at,
        referencesCount: media.references_count,
        isLegalHold: media.is_legal_hold,
        metadata: media.metadata,
        tags: media.tags,
        uploadedBy: media.uploaded_by,
        createdAt: media.created_at,
        updatedAt: media.updated_at,
        isExpired: media.isExpired(),
        needsNotification: media.needsExpirationNotification()
      });
    } catch (error) {
      console.error('Error getting file:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Genera URL de descarga
   * GET /api/media/:id/download
   */
  async getDownloadUrl(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { expires = 3600 } = req.query;

      const url = await this.fileService.getDownloadUrl(id, parseInt(expires as string));

      if (!url) {
        res.status(404).json({ error: 'File not found or not accessible' });
        return;
      }

      res.status(200).json({
        downloadUrl: url,
        expiresIn: parseInt(expires as string)
      });
    } catch (error) {
      console.error('Error generating download URL:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Actualiza metadatos del archivo
   * PATCH /api/media/:id
   */
  async updateFile(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const companyId = req.tenant?.id || 1;
      const { tags, metadata, isLegalHold, extendDays } = req.body;

      const media = await Media.findOne({
        where: {
          id,
          company_id: companyId
        }
      });

      if (!media) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      // Actualizar campos permitidos
      const updateData: any = {};

      if (tags !== undefined) {
        updateData.tags = tags;
      }

      if (metadata !== undefined) {
        updateData.metadata = metadata;
      }

      if (isLegalHold !== undefined) {
        updateData.is_legal_hold = isLegalHold;
      }

      // Extender fecha de expiración si se solicita
      if (extendDays && extendDays > 0) {
        await media.extendExpiration(extendDays);
      }

      if (Object.keys(updateData).length > 0) {
        await media.update(updateData);
      }

      res.status(200).json({
        id: media.id,
        tags: media.tags,
        metadata: media.metadata,
        isLegalHold: media.is_legal_hold,
        expiresAt: media.expires_at
      });
    } catch (error) {
      console.error('Error updating file:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Elimina un archivo
   * DELETE /api/media/:id
   */
  async deleteFile(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const companyId = req.tenant?.id || 1;

      // Verificar que el archivo pertenece a la empresa
      const media = await Media.findOne({
        where: {
          id,
          company_id: companyId
        }
      });

      if (!media) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      // Verificar si tiene referencias activas
      if (media.references_count > 0) {
        res.status(400).json({
          error: 'Cannot delete file with active references',
          referencesCount: media.references_count
        });
        return;
      }

      const success = await this.fileService.deleteFile(id);

      if (!success) {
        res.status(500).json({ error: 'Failed to delete file' });
        return;
      }

      res.status(200).json({ message: 'File deleted successfully' });
    } catch (error) {
      console.error('Error deleting file:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Obtiene estadísticas de uso
   * GET /api/media/stats
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const companyId = req.tenant?.id || 1;

      const stats = await Media.getCompanyStats(companyId);

      res.status(200).json({
        ...stats,
        totalSizeFormatted: this.formatBytes(stats.total_size_bytes),
        retentionPolicy: `${process.env.FILE_RETENTION_DAYS || 30} days`
      });
    } catch (error) {
      console.error('Error getting stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Formatea bytes en formato legible
   */
  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 Bytes';

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }
}

export default MediaController;