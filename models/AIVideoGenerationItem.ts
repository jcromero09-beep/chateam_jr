/**
 * Modelo: AIVideoGenerationItem
 * Representa un video individual generado dentro de una solicitud
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
  import AIVideoGeneration from "./AIVideoGeneration";
  
  @Table({
    tableName: "AIVideoGenerationItems",
    timestamps: true
  })
  class AIVideoGenerationItem extends Model<AIVideoGenerationItem> {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id!: number;
  
    @ForeignKey(() => AIVideoGeneration)
    @AllowNull(false)
    @Index("idx_ai_video_items_generation")
    @Column(DataType.INTEGER)
    aiVideoGenerationId!: number;
  
    @AllowNull(false)
    @Column(DataType.INTEGER)
    companyId!: number; // Denormalizado para facilitar acceso y construcción de fileUrl
  
    @AllowNull(false)
    @Column(DataType.STRING(255))
    fileName!: string;
  
    @AllowNull(true)
    @Column(DataType.STRING(500))
    originalUrl?: string; // URL temporal de OpenAI
  
    @AllowNull(true)
    @Column(DataType.BIGINT)
    fileSize?: number; // Tamaño en bytes
  
    @Default('video/mp4')
    @AllowNull(true)
    @Column(DataType.STRING(50))
    mimeType?: string; // 'video/mp4'
  
    @AllowNull(true)
    @Column(DataType.INTEGER)
    duration?: number; // Duración en segundos
  
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
    @BelongsTo(() => AIVideoGeneration)
    generation!: AIVideoGeneration;
  
    // Métodos auxiliares
  
    get fileUrl(): string {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost';
      const proxyPort = process.env.PROXY_PORT ? `:${process.env.PROXY_PORT}` : '';
      return `${backendUrl}${proxyPort}/public/company${this.companyId}/ai-videos/${this.fileName}`;
    }
  
    get filePath(): string {
      return `public/company${this.companyId}/ai-videos/${this.fileName}`;
    }
  
    async incrementDownloadCount(): Promise<void> {
      await this.increment('downloadCount', { by: 1 });
      await this.reload();
    }
  
    isAvailable(): boolean {
      return !!this.fileName && this.fileName.length > 0;
    }
  
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
  
  export default AIVideoGenerationItem;
  