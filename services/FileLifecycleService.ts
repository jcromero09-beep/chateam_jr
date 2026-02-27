import { S3 } from 'aws-sdk';
import Media from '../models/Media';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import sharp from 'sharp';

interface UploadOptions {
  companyId: number;
  userId: number;
  retentionDays?: number;
  generateThumbnail?: boolean;
  tags?: string[];
  metadata?: any;
}

interface UploadResult {
  media: Media;
  uploadUrl?: string;
  error?: string;
}

/**
 * Servicio para gestión del ciclo de vida de archivos
 */
export class FileLifecycleService {
  private s3Client: S3;
  private defaultRetentionDays: number;

  constructor() {
    // Configurar cliente S3/MinIO
    this.s3Client = new S3({
      endpoint: process.env.S3_ENDPOINT,
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
      s3ForcePathStyle: true,
      signatureVersion: 'v4',
      region: process.env.S3_REGION || 'us-east-1'
    });

    this.defaultRetentionDays = parseInt(process.env.FILE_RETENTION_DAYS || '30');
  }

  // ==========================================
  // MÉTODOS DE UPLOAD
  // ==========================================

  /**
   * Genera una URL presignada para upload directo
   */
  async generateUploadUrl(
    originalName: string,
    mimeType: string,
    sizeBytes: number,
    options: UploadOptions
  ): Promise<UploadResult> {
    try {
      // Validar archivo
      const validation = this.validateFile(originalName, mimeType, sizeBytes);
      if (!validation.valid) {
        return { media: null as any, error: validation.error };
      }

      // Generar nombres únicos
      const fileExtension = path.extname(originalName);
      const uniqueId = crypto.randomUUID();
      const filename = `${uniqueId}${fileExtension}`;
      const storageKey = this.generateStorageKey(options.companyId, filename);

      // Calcular fecha de expiración
      const retentionDays = options.retentionDays || this.defaultRetentionDays;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + retentionDays);

      // Crear registro en BD
      const media = await Media.create({
        company_id: options.companyId,
        original_name: originalName,
        filename,
        mime_type: mimeType,
        size_bytes: sizeBytes,
        storage_provider: 's3',
        storage_key: storageKey,
        storage_bucket: process.env.S3_BUCKET || 'chateam-files',
        storage_region: process.env.S3_REGION || 'us-east-1',
        status: 'processing',
        expires_at: expiresAt,
        uploaded_by: options.userId,
        metadata: options.metadata || {},
        tags: options.tags || []
      });

      // Generar URL presignada
      const uploadUrl = await this.s3Client.getSignedUrlPromise('putObject', {
        Bucket: media.storage_bucket!,
        Key: storageKey,
        ContentType: mimeType,
        Expires: 3600, // 1 hora para completar el upload
        Metadata: {
          'media-id': media.id,
          'company-id': options.companyId.toString(),
          'original-name': originalName
        }
      });

      return {
        media,
        uploadUrl
      };
    } catch (error) {
      console.error('Error generating upload URL:', error);
      return { media: null as any, error: 'Failed to generate upload URL' };
    }
  }

  /**
   * Confirma que el upload se completó exitosamente
   */
  async confirmUpload(mediaId: string): Promise<boolean> {
    try {
      const media = await Media.findByPk(mediaId);
      if (!media) {
        return false;
      }

      // Verificar que el archivo existe en S3
      const exists = await this.verifyFileExists(media.storage_bucket!, media.storage_key);
      if (!exists) {
        await media.update({ status: 'deleted' });
        return false;
      }

      // Actualizar estado y URL
      await media.update({
        status: 'active',
        url: media.getFullUrl()
      });

      // Generar thumbnail si es imagen
      if (media.mime_type.startsWith('image/')) {
        await this.generateThumbnail(media);
      }

      console.log(`✅ Upload confirmed for media: ${media.id}`);
      return true;
    } catch (error) {
      console.error('Error confirming upload:', error);
      return false;
    }
  }

  /**
   * Upload directo de buffer
   */
  async uploadBuffer(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    options: UploadOptions
  ): Promise<UploadResult> {
    try {
      const validation = this.validateFile(originalName, mimeType, buffer.length);
      if (!validation.valid) {
        return { media: null as any, error: validation.error };
      }

      const fileExtension = path.extname(originalName);
      const uniqueId = crypto.randomUUID();
      const filename = `${uniqueId}${fileExtension}`;
      const storageKey = this.generateStorageKey(options.companyId, filename);

      // Upload a S3
      await this.s3Client.upload({
        Bucket: process.env.S3_BUCKET || 'chateam-files',
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType,
        Metadata: {
          'company-id': options.companyId.toString(),
          'original-name': originalName
        }
      }).promise();

      // Calcular fecha de expiración
      const retentionDays = options.retentionDays || this.defaultRetentionDays;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + retentionDays);

      // Crear registro
      const media = await Media.create({
        company_id: options.companyId,
        original_name: originalName,
        filename,
        mime_type: mimeType,
        size_bytes: buffer.length,
        storage_provider: 's3',
        storage_key: storageKey,
        storage_bucket: process.env.S3_BUCKET || 'chateam-files',
        status: 'active',
        expires_at: expiresAt,
        uploaded_by: options.userId,
        metadata: options.metadata || {},
        tags: options.tags || []
      });

      media.url = media.getFullUrl();

      // Generar thumbnail si es imagen
      if (mimeType.startsWith('image/')) {
        await this.generateThumbnail(media);
      }

      return { media };
    } catch (error) {
      console.error('Error uploading buffer:', error);
      return { media: null as any, error: 'Failed to upload file' };
    }
  }

  // ==========================================
  // MÉTODOS DE GESTIÓN
  // ==========================================

  /**
   * Obtiene una URL de descarga presignada
   */
  async getDownloadUrl(mediaId: string, expiresIn: number = 3600): Promise<string | null> {
    try {
      const media = await Media.findByPk(mediaId);
      if (!media || media.status !== 'active') {
        return null;
      }

      return await this.s3Client.getSignedUrlPromise('getObject', {
        Bucket: media.storage_bucket!,
        Key: media.storage_key,
        Expires: expiresIn
      });
    } catch (error) {
      console.error('Error generating download URL:', error);
      return null;
    }
  }

  /**
   * Elimina un archivo físicamente
   */
  async deleteFile(mediaId: string): Promise<boolean> {
    try {
      const media = await Media.findByPk(mediaId);
      if (!media) {
        return false;
      }

      // Eliminar de S3
      await this.s3Client.deleteObject({
        Bucket: media.storage_bucket!,
        Key: media.storage_key
      }).promise();

      // Eliminar thumbnail si existe
      if (media.thumbnail_url) {
        const thumbnailKey = media.storage_key.replace(/\.[^.]+$/, '_thumb.jpg');
        await this.s3Client.deleteObject({
          Bucket: media.storage_bucket!,
          Key: thumbnailKey
        }).promise().catch(() => {});
      }

      // Actualizar estado
      await media.update({
        status: 'deleted',
        url: null,
        thumbnail_url: null
      });

      console.log(`✅ File deleted: ${media.id}`);
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }

  /**
   * Limpia archivos expirados
   */
  async cleanupExpiredFiles(): Promise<{ deleted: number, errors: number }> {
    let deleted = 0;
    let errors = 0;

    try {
      const expiredFiles = await Media.getExpiredFiles();
      console.log(`🗑️ Found ${expiredFiles.length} expired files to cleanup`);

      for (const file of expiredFiles) {
        try {
          const success = await this.deleteFile(file.id);
          if (success) {
            deleted++;
          } else {
            errors++;
          }
        } catch (error) {
          console.error(`Error deleting file ${file.id}:`, error);
          errors++;
        }
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }

    console.log(`🗑️ Cleanup completed: ${deleted} deleted, ${errors} errors`);
    return { deleted, errors };
  }

  // ==========================================
  // MÉTODOS PRIVADOS
  // ==========================================

  /**
   * Valida un archivo
   */
  private validateFile(name: string, mimeType: string, sizeBytes: number): { valid: boolean, error?: string } {
    // Validar tamaño máximo (50MB por defecto)
    const maxSize = parseInt(process.env.MAX_FILE_SIZE_BYTES || '52428800'); // 50MB
    if (sizeBytes > maxSize) {
      return { valid: false, error: `File too large. Maximum size: ${maxSize / 1024 / 1024}MB` };
    }

    // Validar tipos MIME permitidos
    const allowedTypes = (process.env.ALLOWED_MIME_TYPES ||
      'image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ).split(',');

    if (!allowedTypes.includes(mimeType)) {
      return { valid: false, error: `File type not allowed: ${mimeType}` };
    }

    // Validar extensión
    const extension = path.extname(name).toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.txt', '.doc', '.docx'];

    if (!allowedExtensions.includes(extension)) {
      return { valid: false, error: `File extension not allowed: ${extension}` };
    }

    return { valid: true };
  }

  /**
   * Genera la clave de almacenamiento
   */
  private generateStorageKey(companyId: number, filename: string): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');

    return `companies/${companyId}/${year}/${month}/${filename}`;
  }

  /**
   * Verifica si un archivo existe en S3
   */
  private async verifyFileExists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.s3Client.headObject({ Bucket: bucket, Key: key }).promise();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Genera thumbnail para imágenes
   */
  private async generateThumbnail(media: Media): Promise<void> {
    try {
      if (!media.mime_type.startsWith('image/')) {
        return;
      }

      // Descargar imagen original
      const originalObject = await this.s3Client.getObject({
        Bucket: media.storage_bucket!,
        Key: media.storage_key
      }).promise();

      if (!originalObject.Body) {
        return;
      }

      // Generar thumbnail
      const thumbnailBuffer = await sharp(originalObject.Body as Buffer)
        .resize(300, 300, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      // Subir thumbnail
      const thumbnailKey = media.storage_key.replace(/\.[^.]+$/, '_thumb.jpg');

      await this.s3Client.upload({
        Bucket: media.storage_bucket!,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: 'image/jpeg'
      }).promise();

      // Actualizar URL del thumbnail
      const thumbnailUrl = `${process.env.S3_ENDPOINT}/${media.storage_bucket}/${thumbnailKey}`;
      await media.update({ thumbnail_url: thumbnailUrl });

      console.log(`✅ Thumbnail generated for media: ${media.id}`);
    } catch (error) {
      console.error(`Error generating thumbnail for ${media.id}:`, error);
    }
  }
}

export default FileLifecycleService;