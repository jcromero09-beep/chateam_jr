/**
 * Modelo: AIImageGeneration
 * Representa una solicitud de generación de imágenes con IA
 * Migrado desde Laravel AiGen (PromptModel con type='image')
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
import AIImageGenerationItem from "./AIImageGenerationItem";
import AIImageCreditTransaction from "./AIImageCreditTransaction";

@Table({
  tableName: "AIImageGenerations",
  timestamps: true
})
class AIImageGeneration extends Model<AIImageGeneration> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_ai_image_gen_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index("idx_ai_image_gen_user")
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
  imageSize!: string; // '1024x1024', '512x512', '256x256'

  @Default(1)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  numberOfImages!: number;

  @AllowNull(true)
  @Column(DataType.STRING(100))
  stylePreset?: string; // 'realistic', 'cartoon', 'anime', etc.

  @Default('dall-e-3')
  @AllowNull(false)
  @Column(DataType.STRING(50))
  model!: string; // 'dall-e-2', 'dall-e-3'

  @Default('pending')
  @AllowNull(false)
  @Index("idx_ai_image_gen_status")
  @Column(DataType.STRING(50))
  status!: string; // 'pending', 'processing', 'completed', 'failed', 'partial_failure'

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
  @Column(DataType.JSONB)
  metadata?: Record<string, any>; // Datos adicionales de la API de OpenAI

  @CreatedAt
  @Index("idx_ai_image_gen_created")
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

  @HasMany(() => AIImageGenerationItem)
  images!: AIImageGenerationItem[];

  @HasMany(() => AIImageCreditTransaction)
  creditTransactions!: AIImageCreditTransaction[];

  // Métodos auxiliares

  /**
   * Verifica si la generación está completada
   */
  isCompleted(): boolean {
    return this.status === 'completed';
  }

  /**
   * Verifica si la generación falló
   */
  isFailed(): boolean {
    return this.status === 'failed';
  }

  /**
   * Verifica si la generación está en proceso
   */
  isProcessing(): boolean {
    return this.status === 'processing';
  }

  /**
   * Marca la generación como completada
   */
  async markAsCompleted(): Promise<void> {
    this.status = 'completed';
    await this.save();
  }

  /**
   * Marca la generación como fallida
   * @param errorMessage Mensaje de error
   */
  async markAsFailed(errorMessage: string): Promise<void> {
    this.status = 'failed';
    this.errorMessage = errorMessage;
    await this.save();
  }

  /**
   * Marca la generación como en proceso
   */
  async markAsProcessing(): Promise<void> {
    this.status = 'processing';
    await this.save();
  }
}

export default AIImageGeneration;
