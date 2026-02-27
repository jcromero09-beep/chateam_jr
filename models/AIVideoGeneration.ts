/**
 * Modelo: AIVideoGeneration
 * Representa una solicitud de generación de videos con IA (OpenAI Sora)
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
    HasMany,
    CreatedAt,
    UpdatedAt,
    Default,
    Index,
    AllowNull
  } from "sequelize-typescript";
  import Company from "./Company";
  import User from "./User";
  import AIProviderConfig from "./AIProviderConfig";
  import AIVideoGenerationItem from "./AIVideoGenerationItem";
  import AIVideoCreditTransaction from "./AIVideoCreditTransaction";
  
  @Table({
    tableName: "AIVideoGenerations",
    timestamps: true
  })
  class AIVideoGeneration extends Model<AIVideoGeneration> {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id!: number;
  
    @ForeignKey(() => Company)
    @AllowNull(false)
    @Index("idx_ai_video_gen_company")
    @Column(DataType.INTEGER)
    companyId!: number;
  
    @ForeignKey(() => User)
    @AllowNull(false)
    @Index("idx_ai_video_gen_user")
    @Column(DataType.INTEGER)
    userId!: number;
  
    @ForeignKey(() => AIProviderConfig)
    @AllowNull(true)
    @Column(DataType.INTEGER)
    aiProviderConfigId?: number;
  
    @AllowNull(false)
    @Column(DataType.TEXT)
    prompt!: string;
  
    @AllowNull(false)
    @Column(DataType.STRING(50))
    videoSize!: string; // '1280x720', '720x1280', '1792x1024', '1024x1792'
  
    @AllowNull(false)
    @Column(DataType.INTEGER)
    duration!: number; // Duración en segundos: 4, 8, 12, 10, 15, 25
  
    @AllowNull(true)
    @Column(DataType.STRING(100))
    stylePreset?: string; // 'cinematic', 'realistic', 'anime', etc.
  
    @Default('sora-2')
    @AllowNull(false)
    @Column(DataType.STRING(50))
    model!: string; // 'sora-2', 'sora-2-pro'
  
    @Default('pending')
    @AllowNull(false)
    @Index("idx_ai_video_gen_status")
    @Column(DataType.STRING(50))
    status!: string; // 'pending', 'processing', 'completed', 'failed'
  
    @AllowNull(true)
    @Column(DataType.TEXT)
    errorMessage?: string;
  
    @AllowNull(false)
    @Column(DataType.INTEGER)
    totalCreditsUsed!: number;
  
    @AllowNull(true)
    @Column(DataType.DECIMAL(10, 5))
    totalCostUsd?: number;
  
    @AllowNull(true)
    @Column(DataType.STRING(255))
    openaiVideoId?: string; // ID del video en OpenAI para polling
  
    @AllowNull(true)
    @Column(DataType.INTEGER)
    progress?: number; // Progreso del polling (0-100)
  
    @AllowNull(true)
    @Column(DataType.JSONB)
    metadata?: Record<string, any>; // Datos adicionales de la API de OpenAI
  
    @CreatedAt
    @Index("idx_ai_video_gen_created")
    @Column(DataType.DATE)
    createdAt!: Date;
  
    @UpdatedAt
    @Column(DataType.DATE)
    updatedAt!: Date;
  
    // Relaciones
    @BelongsTo(() => Company)
    company!: Company;
  
    @BelongsTo(() => User)
    user!: User;
  
    @BelongsTo(() => AIProviderConfig)
    aiProviderConfig?: AIProviderConfig;
  
    @HasMany(() => AIVideoGenerationItem)
    videos!: AIVideoGenerationItem[];
  
    @HasMany(() => AIVideoCreditTransaction)
    creditTransactions!: AIVideoCreditTransaction[];
  
    // Métodos auxiliares
  
    isCompleted(): boolean {
      return this.status === 'completed';
    }
  
    isFailed(): boolean {
      return this.status === 'failed';
    }
  
    isProcessing(): boolean {
      return this.status === 'processing';
    }
  
    isPending(): boolean {
      return this.status === 'pending';
    }
  
    async markAsCompleted(): Promise<void> {
      this.status = 'completed';
      this.progress = 100;
      await this.save();
    }
  
    async markAsFailed(errorMessage: string): Promise<void> {
      this.status = 'failed';
      this.errorMessage = errorMessage;
      await this.save();
    }
  
    async markAsProcessing(): Promise<void> {
      this.status = 'processing';
      await this.save();
    }
  
    async updateProgress(progress: number): Promise<void> {
      this.progress = progress;
      await this.save();
    }
  }
  
  export default AIVideoGeneration;
  