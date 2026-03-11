import { Transaction, Sequelize, QueryTypes } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import Media from "../models/Media";
import { TenantManager } from "../helpers/TenantManager";
import { S3Service } from "./S3Service";
import AppError from "../errors/AppError";
import sequelize from "../database";

export interface CreateFileOptions {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  retentionDays?: number;
  meta?: any;
  ownerUserId?: number;
}

export interface FileUploadResult {
  mediaId: string;
  uploadUrl: string;
  expiresAt: string;
  storageKey: string;
}

export class FileService {
  private sequelize: Sequelize;

  constructor(private s3Service: S3Service) {
    this.sequelize = sequelize;
  }

  /**
   * Helper para ejecutar operaciones en el schema del tenant
   */
  private async withTenant(companyId: number, transaction: Transaction, fn: () => Promise<any>): Promise<any> {
    const tenant = await TenantManager.getTenantByIdentifier(String(companyId));
    if (!tenant) {
      throw new AppError("Company not found", 404);
    }

    await TenantManager.setSearchPath(tenant.schema_name);
    try {
      return await fn();
    } finally {
      await TenantManager.resetSearchPath();
    }
  }

  /**
   * Genera una URL presigned para subir un archivo
   */
  async generateUploadUrl(
    companyId: number,
    options: CreateFileOptions,
    transaction: Transaction
  ): Promise<FileUploadResult> {
    const mediaId = uuidv4();
    const storageKey = `tenants/${companyId}/media/${mediaId}_${options.fileName}`;

    // Obtener configuración de retención de la empresa
    const retentionDays = options.retentionDays || 30;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + retentionDays);

    // Crear registro en la base de datos
    await this.withTenant(companyId, transaction, async () => {
      await Media.create({
        id: mediaId,
        company_id: companyId,
        original_name: options.fileName,
        filename: `${mediaId}_${options.fileName}`,
        mime_type: options.contentType,
        size_bytes: options.sizeBytes,
        storage_provider: 's3',
        storage_key: storageKey,
        status: 'active',
        expires_at: expiresAt,
        references_count: 0,
        is_legal_hold: false,
        uploaded_by: options.ownerUserId || 0,
        metadata: options.meta || {}
      });
    });

    // Generar URL presigned para S3
    const uploadUrl = await this.s3Service.getSignedUploadUrl(
      storageKey,
      options.contentType
    );

    return {
      mediaId,
      uploadUrl,
      expiresAt: expiresAt.toISOString(),
      storageKey
    };
  }

  /**
   * Completa el upload de un archivo
   */
  async completeUpload(
    mediaId: string,
    companyId: number,
    actualSizeBytes: number,
    transaction: Transaction
  ): Promise<Media> {
    let media: Media | null = null;

    await this.withTenant(companyId, transaction, async () => {
      media = await Media.findByPk(mediaId);

      if (!media) {
        throw new AppError("Media not found", 404);
      }

      // Actualizar tamaño real del archivo
      await media.update({
        size_bytes: actualSizeBytes,
        status: 'active'
      });
    });

    if (!media) {
      throw new AppError("Media not found", 404);
    }

    // Programar jobs de notificación de expiración
    await this.scheduleExpirationJobs(mediaId, media.expires_at);

    return media;
  }

  /**
   * Obtiene información de un archivo
   */
  async getFile(
    mediaId: string,
    companyId: number,
    transaction: Transaction
  ): Promise<Media> {
    let media: Media | null = null;

    await this.withTenant(companyId, transaction, async () => {
      media = await Media.findByPk(mediaId);

      if (!media) {
        throw new AppError("File not found", 404);
      }

      // Verificar si el archivo está accesible (no expirado y no eliminado)
      if (media.isExpired() || media.status === 'deleted') {
        throw new AppError("File not accessible", 403);
      }
    });

    if (!media) {
      throw new AppError("File not found", 404);
    }

    return media;
  }

  /**
   * Lista archivos de una empresa
   */
  async listFiles(
    companyId: number,
    filters: {
      status?: string;
      contentType?: string;
      ownerUserId?: number;
      page?: number;
      limit?: number;
    },
    transaction: Transaction
  ): Promise<{ files: Media[]; total: number }> {
    const { status, contentType, ownerUserId, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let files: Media[] = [];
    let total = 0;

    await this.withTenant(companyId, transaction, async () => {
      const whereClause: any = { company_id: companyId };

      if (status) whereClause.status = status;
      if (contentType) whereClause.mime_type = contentType;
      if (ownerUserId) whereClause.uploaded_by = ownerUserId;

      files = await Media.findAll({
        where: whereClause,
        limit,
        offset,
        order: [['created_at', 'DESC']]
      });

      total = await Media.count({
        where: whereClause
      });
    });

    return { files, total };
  }

  /**
   * Elimina un archivo
   */
  async deleteFile(
    mediaId: string,
    companyId: number,
    transaction: Transaction
  ): Promise<void> {
    await this.withTenant(companyId, transaction, async () => {
      const media = await Media.findOne({
        where: { id: mediaId, company_id: companyId }
      });

      if (!media) {
        throw new AppError("File not found", 404);
      }

      if (media.references_count > 0) {
        throw new AppError("Cannot delete file with active references", 400);
      }

      // Eliminar de S3
      await this.s3Service.deleteObject(media.storage_key);

      // Marcar como eliminado
      await media.update({
        status: 'deleted'
      });
    });
  }

  /**
   * Extiende la expiración de un archivo
   */
  async extendExpiration(
    mediaId: string,
    companyId: number,
    additionalDays: number,
    transaction: Transaction
  ): Promise<Media> {
    let media: Media | null = null;

    await this.withTenant(companyId, transaction, async () => {
      media = await Media.findOne({
        where: { id: mediaId, company_id: companyId }
      });

      if (!media) {
        throw new AppError("File not found", 404);
      }

      const newExpiration = new Date(media.expires_at);
      newExpiration.setDate(newExpiration.getDate() + additionalDays);

      await media.update({
        expires_at: newExpiration
      });

      // Reprogramar jobs de notificación
      await this.scheduleExpirationJobs(mediaId, newExpiration);
    });

    if (!media) {
      throw new AppError("File not found", 404);
    }

    return media;
  }

  /**
   * Programa jobs de notificación de expiración
   */
  private async scheduleExpirationJobs(mediaId: string, expiresAt: Date): Promise<void> {
    const now = new Date();

    // Notificación 25 días antes
    const notify25d = new Date(expiresAt.getTime() - 25 * 24 * 60 * 60 * 1000);
    if (notify25d > now) {
      // Aquí se programaría el job con Bull
      console.log(`Programando notificación 25d para media ${mediaId}`);
    }

    // Notificación 29 días antes
    const notify29d = new Date(expiresAt.getTime() - 1 * 24 * 60 * 60 * 1000);
    if (notify29d > now) {
      console.log(`Programando notificación 29d para media ${mediaId}`);
    }

    // Borrado 30 días después
    console.log(`Programando borrado para media ${mediaId} en ${expiresAt}`);
  }

  /**
   * Obtiene estadísticas de archivos por empresa
   */
  async getFileStats(companyId: number, transaction: Transaction): Promise<any> {
    const result = await this.withTenant(companyId, transaction, async () => {
      const stats = await Media.findAll({
        attributes: [
          'status',
          [this.sequelize.fn('COUNT', this.sequelize.col('id')), 'count'],
          [this.sequelize.fn('SUM', this.sequelize.col('size_bytes')), 'total_size']
        ],
        group: ['status'],
        raw: true
      });

      const totalFiles = await Media.count();
      const totalSize = await Media.sum('size_bytes');

      return {
        totalFiles,
        totalSizeBytes: totalSize || 0,
        byStatus: stats.reduce((acc: any, stat: any) => {
          acc[stat.status] = {
            count: parseInt(stat.count),
            sizeBytes: parseInt(stat.total_size) || 0
          };
          return acc;
        }, {} as any)
      };
    });

    return result;
  }
}
