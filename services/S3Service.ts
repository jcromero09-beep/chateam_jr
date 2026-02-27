import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface S3Config {
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

export class S3Service {
  private s3Client: S3Client;
  private bucket: string;

  constructor(config: S3Config) {
    this.s3Client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
    this.bucket = config.bucket;
  }

  /**
   * Genera URL presigned para subir archivo
   */
  async getSignedUploadUrl(key: string, contentType: string, expiresIn: number = 300): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Genera URL presigned para descargar archivo
   */
  async getSignedDownloadUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  /**
   * Elimina un objeto de S3
   */
  async deleteObject(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    await this.s3Client.send(command);
  }

  /**
   * Obtiene metadatos de un objeto
   */
  async getObjectMetadata(key: string): Promise<any> {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    try {
      const response = await this.s3Client.send(command);
      return {
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        metadata: response.Metadata
      };
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Verifica si un objeto existe
   */
  async objectExists(key: string): Promise<boolean> {
    const metadata = await this.getObjectMetadata(key);
    return metadata !== null;
  }

  /**
   * Calcula checksum de un archivo
   */
  async calculateChecksum(file: Buffer): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(file).digest('hex');
  }

  /**
   * Sube un archivo directamente (para archivos pequeños)
   */
  async uploadFile(key: string, file: Buffer, contentType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file,
      ContentType: contentType
    });

    await this.s3Client.send(command);
  }

  /**
   * Descarga un archivo
   */
  async downloadFile(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    const response = await this.s3Client.send(command);
    const chunks: Buffer[] = [];

    if (response.Body) {
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
    }

    return Buffer.concat(chunks);
  }

  /**
   * Lista objetos en un prefijo
   */
  async listObjects(prefix?: string): Promise<any[]> {
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix
    });

    const response = await this.s3Client.send(command);
    return response.Contents || [];
  }

  /**
   * Obtiene información del bucket
   */
  async getBucketInfo(): Promise<any> {
    const objects = await this.listObjects();
    const totalSize = objects.reduce((sum, obj) => sum + (obj.Size || 0), 0);

    return {
      bucket: this.bucket,
      objectCount: objects.length,
      totalSizeBytes: totalSize,
      totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100
    };
  }
}

// Factory function para crear instancia con variables de entorno
export function createS3Service(): S3Service {
  const config: S3Config = {
    region: process.env.S3_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
    bucket: process.env.S3_BUCKET!
  };

  return new S3Service(config);
}