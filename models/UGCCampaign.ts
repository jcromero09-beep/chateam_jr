/**
 * Model: UGCCampaign
 * Represents a User-Generated Content campaign that orchestrates
 * video generation, publishing, and optimization workflows.
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
import UGCVideoJob from "./UGCVideoJob";
import UGCVideoAsset from "./UGCVideoAsset";

// Estados del ciclo de vida de una campana UGC
export type UGCCampaignStatus =
  | "draft"
  | "briefing"
  | "producing"
  | "review"
  | "publishing"
  | "active"
  | "optimizing"
  | "paused"
  | "completed"
  | "archived";

// Interfaz para el brief del producto
export interface UGCProductBrief {
  productName?: string;
  productUrl?: string;
  targetAudience?: string;
  keyFeatures?: string[];
  tone?: string;
  callToAction?: string;
  hashtags?: string[];
  competitorUrls?: string[];
}

// Configuracion de generacion de contenido
export interface UGCGenerationConfig {
  videoCount?: number;
  videoDuration?: number;
  aspectRatio?: string;
  avatarProvider?: string;
  voiceProvider?: string;
  voiceId?: string;
  musicEnabled?: boolean;
  subtitlesEnabled?: boolean;
  templateId?: string;
  hooks?: string[];
}

// Configuracion de publicacion
export interface UGCPublishConfig {
  platforms?: string[];
  scheduleType?: "immediate" | "scheduled" | "optimal_time";
  scheduledAt?: string;
  autoPublish?: boolean;
  crossPost?: boolean;
  captionTemplate?: string;
}

// Configuracion de optimizacion
export interface UGCOptimizationConfig {
  enabled?: boolean;
  metricsToTrack?: string[];
  optimizationInterval?: number;
  minSampleSize?: number;
  abTestEnabled?: boolean;
  autoRotate?: boolean;
}

@Table({
  tableName: "UGCCampaigns",
  timestamps: true
})
class UGCCampaign extends Model<UGCCampaign> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_ugc_campaigns_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  productId?: number;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  name!: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  description?: string;

  @Default("draft")
  @AllowNull(false)
  @Index("idx_ugc_campaigns_status")
  @Column(DataType.STRING(50))
  status!: UGCCampaignStatus;

  @Default({})
  @AllowNull(true)
  @Column(DataType.JSONB)
  productBrief!: UGCProductBrief;

  @Default({})
  @AllowNull(true)
  @Column(DataType.JSONB)
  generationConfig!: UGCGenerationConfig;

  @Default({})
  @AllowNull(true)
  @Column(DataType.JSONB)
  publishConfig!: UGCPublishConfig;

  @Default({})
  @AllowNull(true)
  @Column(DataType.JSONB)
  optimizationConfig!: UGCOptimizationConfig;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(10, 2))
  budget!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(10, 2))
  budgetSpent!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  totalVideosGenerated!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  totalPostsPublished!: number;

  @AllowNull(true)
  @Column(DataType.DECIMAL(5, 2))
  overallScore?: number;

  @AllowNull(true)
  @Column(DataType.DATEONLY)
  startedAt?: Date;

  @AllowNull(true)
  @Column(DataType.DATEONLY)
  completedAt?: Date;

  @AllowNull(true)
  @Column(DataType.DATEONLY)
  nextOptimizationAt?: Date;

  @Default({})
  @AllowNull(true)
  @Column(DataType.JSONB)
  metadata!: Record<string, unknown>;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Index("idx_ugc_campaigns_created_by")
  @Column(DataType.INTEGER)
  createdBy?: number;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt!: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt!: Date;

  // --- Relaciones ---

  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => User, "createdBy")
  creator?: User;

  @HasMany(() => UGCVideoJob)
  videoJobs!: UGCVideoJob[];

  @HasMany(() => UGCVideoAsset)
  videoAssets!: UGCVideoAsset[];

  // --- Metodos auxiliares ---

  isDraft(): boolean {
    return this.status === "draft";
  }

  isActive(): boolean {
    return this.status === "active";
  }

  isCompleted(): boolean {
    return this.status === "completed";
  }

  getBudgetRemaining(): number {
    return Number(this.budget) - Number(this.budgetSpent);
  }

  isBudgetExhausted(): boolean {
    return this.getBudgetRemaining() <= 0 && Number(this.budget) > 0;
  }

  async markAsActive(): Promise<void> {
    this.status = "active";
    this.startedAt = new Date();
    await this.save();
  }

  async markAsCompleted(): Promise<void> {
    this.status = "completed";
    this.completedAt = new Date();
    await this.save();
  }

  async pause(): Promise<void> {
    this.status = "paused";
    await this.save();
  }
}

export default UGCCampaign;
