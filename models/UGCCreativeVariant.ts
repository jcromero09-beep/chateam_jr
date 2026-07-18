/**
 * Model: UGCCreativeVariant
 * Represents a creative variant within a UGC campaign for A/B testing.
 * Tracks performance metrics to determine the winning variant.
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
  Default,
  Index,
  AllowNull
} from "sequelize-typescript";
import Company from "./Company";
import UGCCampaign from "./UGCCampaign";

@Table({
  tableName: "UGCCreativeVariants",
  timestamps: true
})
class UGCCreativeVariant extends Model<UGCCreativeVariant> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_ugc_creative_variants_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @ForeignKey(() => UGCCampaign)
  @AllowNull(false)
  @Index("idx_ugc_creative_variants_campaign")
  @Column(DataType.INTEGER)
  ugcCampaignId!: number;

  @AllowNull(false)
  @Column(DataType.STRING(10))
  variantLabel!: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  name!: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  description?: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  scriptVariation?: string;

  @AllowNull(true)
  @Column(DataType.JSONB)
  avatarConfig?: Record<string, unknown>;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  videoStyle?: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  captionVariation?: string;

  @AllowNull(true)
  @Column(DataType.STRING(1024))
  thumbnailUrl?: string;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  views!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  likes!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  comments!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  shares!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(5, 2))
  engagementRate!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(5, 2))
  conversionRate!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(3, 2))
  confidenceLevel!: number;

  @Default(false)
  @AllowNull(false)
  @Index("idx_ugc_creative_variants_winner")
  @Column(DataType.BOOLEAN)
  isWinner!: boolean;

  @Default(true)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  isActive!: boolean;

  @Default({})
  @AllowNull(true)
  @Column(DataType.JSONB)
  metadata!: Record<string, unknown>;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt!: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt!: Date;

  // --- Relaciones ---

  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => UGCCampaign)
  ugcCampaign!: UGCCampaign;

  // --- Metodos auxiliares ---

  getTotalEngagement(): number {
    return this.likes + this.comments + this.shares;
  }

  hasStatisticalSignificance(): boolean {
    return Number(this.confidenceLevel) >= 0.95;
  }

  async declareWinner(): Promise<void> {
    this.isWinner = true;
    await this.save();
  }

  async deactivate(): Promise<void> {
    this.isActive = false;
    await this.save();
  }

  async updateMetrics(metrics: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    engagementRate?: number;
    conversionRate?: number;
    confidenceLevel?: number;
  }): Promise<void> {
    if (metrics.views !== undefined) this.views = metrics.views;
    if (metrics.likes !== undefined) this.likes = metrics.likes;
    if (metrics.comments !== undefined) this.comments = metrics.comments;
    if (metrics.shares !== undefined) this.shares = metrics.shares;
    if (metrics.engagementRate !== undefined) this.engagementRate = metrics.engagementRate;
    if (metrics.conversionRate !== undefined) this.conversionRate = metrics.conversionRate;
    if (metrics.confidenceLevel !== undefined) this.confidenceLevel = metrics.confidenceLevel;
    await this.save();
  }
}

export default UGCCreativeVariant;
