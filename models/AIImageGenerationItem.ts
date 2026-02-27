/**
 * Modelo: AIImageGenerationItem
 * Representa una imagen individual generada dentro de una solicitud
 * Migrado desde Laravel AiGen (almacenamiento de archivos en MediaEngine)
 */

import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  Index,
  AllowNull,
  Default
} from "sequelize-typescript";
import AIImageGeneration from "./AIImageGeneration";

@Table({
  tableName: "AIImageGenerationItems",
  timestamps: true
})
class AIImageGenerationItem extends Model<AIImageGenerationItem> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => AIImageGeneration)
  @AllowNull(false)
  @Index("idx_ai_image_items_generation")
  @Column(DataType.INTEGER)
  aiImageGenerationId!: number;

  @AllowNull(false)
  @Column(DataType.INTEGER)
  companyId!: number; // Denormalizado para facilitar acceso y construcción de fileUrl

  @AllowNull(false)
  @Column(DataType.STRING(255))
  fileName!: string;

  @AllowNull(true)
  @Column(DataType.STRING(500))
  originalUrl?: string; // URL temporal de OpenAI (expira en 1 hora)

  @AllowNull(true)
  @Column(DataType.BIGINT)
  fileSize?: number; // Tamaño en bytes

  @Default('image/png')
  @AllowNull(true)
  @Column(DataType.STRING(50))
  mimeType?: string; // 'image/png', 'image/jpeg'

  @Default(0)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  downloadCount?: number;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt!: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt!: Date;

  // Relación
  @BelongsTo(() => AIImageGeneration)
  generation!: AIImageGeneration;

  // Métodos auxiliares

  /**
   * Obtiene la URL pública del archivo
   * Construye la URL basada en BACKEND_URL y la estructura de carpetas
   */
  get fileUrl(): string {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost';
    const proxyPort = process.env.PROXY_PORT ? `:${process.env.PROXY_PORT}` : '';
    return `${backendUrl}${proxyPort}/public/company${this.companyId}/ai-images/${this.fileName}`;
  }

  /**
   * Obtiene la ruta física del archivo en el servidor
   */
  get filePath(): string {
    return `public/company${this.companyId}/ai-images/${this.fileName}`;
  }

  /**
   * Incrementa el contador de descargas de forma atómica
   * Usa UPDATE SET downloadCount = downloadCount + 1 para prevenir race conditions
   */
  async incrementDownloadCount(): Promise<void> {
    // Usar increment atómico de Sequelize para prevenir race conditions
    // Esto genera: UPDATE ... SET "downloadCount" = "downloadCount" + 1 WHERE id = ?
    await this.increment('downloadCount', { by: 1 });
    await this.reload(); // Recargar para tener el valor actualizado en la instancia
  }

  /**
   * Verifica si la imagen está disponible (tiene fileName y no está eliminada)
   */
  isAvailable(): boolean {
    return !!this.fileName && this.fileName.length > 0;
  }

  /**
   * Obtiene el tamaño formateado (KB, MB, etc.)
   */
  getFormattedFileSize(): string {
    if (!this.fileSize) return 'Unknown';

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = this.fileSize;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

export default AIImageGenerationItem;
