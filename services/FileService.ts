import { Transaction } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import Media, { MediaMeta } from "../models/Media";
import { TenantManager } from "../helpers/TenantManager";
import { S3Service } from "./S3Service";
import AppError from "../errors/AppError";

export interface CreateFileOptions {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  retentionDays?: number;
  meta?: MediaMeta;
  ownerUserId?: number;
}

export interface FileUploadResult {
  mediaId: string;
  uploadUrl: string;
  expiresAt: string;
  storageKey: string;
}

export class FileService {
  constructor(private s3Service: S3Service) {}

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

    const schema = TenantManager.getSchemaName(companyId);

    // Crear registro en la base de datos
    await TenantManager.withTenant(schema, transaction, async () => {
      await Media.create({
        id: mediaId,
        companyId,
        ownerUserId: options.ownerUserId,
        storageKey,
        contentType: options.contentType,
        sizeBytes: options.sizeBytes,
        status: 'active',
        expiresAt,
        referencesCount: 0,
        isLegalHold: false,
        meta: options.meta || {}
      }, { transaction });
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
    const schema = TenantManager.getSchemaName(companyId);

    let media: Media | null = null;

    await TenantManager.withTenant(schema, transaction, async () => {
      media = await Media.findByPk(mediaId, { transaction });

      if (!media) {
        throw new AppError("Media not found", 404);
      }

      // Actualizar tamaño real del archivo
      await media.update({
        sizeBytes: actualSizeBytes,
        status: 'active'
      }, { transaction });
    });

    if (!media) {
      throw new AppError("Media not found", 404);
    }

    // Programar jobs de notificación de expiración
    await this.scheduleExpirationJobs(mediaId, media.expiresAt);

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
    const schema = TenantManager.getSchemaName(companyId);

    let media: Media | null = null;

    await TenantManager.withTenant(schema, transaction, async () => {
      media = await Media.findByPk(mediaId, { transaction });

      if (!media) {
        throw new AppError("File not found", 404);
      }

      if (!media.isAccessible()) {
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
    const schema = TenantManager.getSchemaName(companyId);
    const { status, contentType, ownerUserId, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let files: Media[] = [];
    let total = 0;

    await TenantManager.withTenant(schema, transaction, async () => {
      const whereClause: any = { companyId };

      if (status) whereClause.status = status;
      if (contentType) whereClause.contentType = contentType;
      if (ownerUserId) whereClause.ownerUserId = ownerUserId;

      files = await Media.findAll({
        where: whereClause,
        limit,
        offset,
        order: [['createdAt', 'DESC']],
        transaction
      });

      total = await Media.count({
        where: whereClause,
        transaction
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
    const schema = TenantManager.getSchemaName(companyId);

    await TenantManager.withTenant(schema, transaction, async () => {
      const media = await Media.findOne({
        where: { id: mediaId, companyId },
        transaction
      });

      if (!media) {
        throw new AppError("File not found", 404);
      }

      if (media.referencesCount > 0) {
        throw new AppError("Cannot delete file with active references", 400);
      }

      // Eliminar de S3
      await this.s3Service.deleteObject(media.storageKey);

      // Marcar como eliminado
      await media.update({
        status: 'deleted',
        deletedAt: new Date()
      }, { transaction });
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
    const schema = TenantManager.getSchemaName(companyId);

    let media: Media | null = null;

    await TenantManager.withTenant(schema, transaction, async () => {
      media = await Media.findOne({
        where: { id: mediaId, companyId },
        transaction
      });

      if (!media) {
        throw new AppError("File not found", 404);
      }

      const newExpiration = new Date(media.expiresAt);
      newExpiration.setDate(newExpiration.getDate() + additionalDays);

      await media.update({
        expiresAt: newExpiration
      }, { transaction });

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
    const schema = TenantManager.getSchemaName(companyId);

    const result = await TenantManager.withTenant(schema, transaction, async () => {
      const stats = await Media.findAll({
        attributes: [
          'status',
          [transaction.sequelize.fn('COUNT', transaction.sequelize.col('id')), 'count'],
          [transaction.sequelize.fn('SUM', transaction.sequelize.col('size_bytes')), 'total_size']
        ],
        group: ['status'],
        raw: true,
        transaction
      });

      const totalFiles = await Media.count({ transaction });
      const totalSize = await Media.sum('sizeBytes', { transaction });

      return {
        totalFiles,
        totalSizeBytes: totalSize || 0,
        byStatus: stats.reduce((acc, stat) => {
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