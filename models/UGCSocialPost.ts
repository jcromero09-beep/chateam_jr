/**
 * Model: UGCSocialPost
 * Represents a social media publication with performance metrics,
 * linked to campaigns, video jobs, and agent identities.
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
import UGCSocialAccount from "./UGCSocialAccount";
import UGCCampaign from "./UGCCampaign";
import UGCVideoJob from "./UGCVideoJob";
import AgentIdentity from "./AgentIdentity";

// Estados del ciclo de vida de una publicacion
export type SocialPostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "archived";

// Tipo de publicacion segun la plataforma
export type SocialPostType =
  | "feed"
  | "story"
  | "reel"
  | "short"
  | "live"
  | "carousel";

// Plataformas soportadas
export type SocialPostPlatform = "instagram" | "tiktok" | "facebook" | "youtube";

@Table({
  tableName: "UGCSocialPosts",
  timestamps: true
})
class UGCSocialPost extends Model<UGCSocialPost> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_ugc_social_posts_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @ForeignKey(() => UGCSocialAccount)
  @AllowNull(false)
  @Index("idx_ugc_social_posts_account")
  @Column(DataType.INTEGER)
  socialAccountId!: number;

  @ForeignKey(() => UGCCampaign)
  @AllowNull(true)
  @Index("idx_ugc_social_posts_campaign")
  @Column(DataType.INTEGER)
  ugcCampaignId?: number;

  @ForeignKey(() => UGCVideoJob)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  ugcVideoJobId?: number;

  @ForeignKey(() => AgentIdentity)
  @AllowNull(true)
  @Index("idx_ugc_social_posts_identity")
  @Column(DataType.INTEGER)
  agentIdentityId?: number;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  platformPostId?: string;

  @AllowNull(false)
  @Index("idx_ugc_social_posts_platform")
  @Column(DataType.STRING(50))
  platform!: SocialPostPlatform;

  @AllowNull(false)
  @Column(DataType.STRING(50))
  postType!: SocialPostType;

  @AllowNull(true)
  @Column(DataType.TEXT)
  caption?: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  mediaUrl?: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  thumbnailUrl?: string;

  @AllowNull(true)
  @Column(DataType.DATE)
  publishedAt?: Date;

  @AllowNull(true)
  @Column(DataType.DATE)
  scheduledAt?: Date;

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
  @Column(DataType.INTEGER)
  saves!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(5, 2))
  engagementRate!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  reachCount!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  impressionCount!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  purchaseIntents!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  whatsappTriggers!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(8, 2))
  roas!: number;

  @AllowNull(true)
  @Column(DataType.DATE)
  lastMetricsSyncAt?: Date;

  @Default("draft")
  @AllowNull(false)
  @Index("idx_ugc_social_posts_status")
  @Column(DataType.STRING(50))
  status!: SocialPostStatus;

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

  @BelongsTo(() => UGCSocialAccount)
  socialAccount!: UGCSocialAccount;

  @BelongsTo(() => UGCCampaign)
  ugcCampaign?: UGCCampaign;

  @BelongsTo(() => UGCVideoJob)
  ugcVideoJob?: UGCVideoJob;

  @BelongsTo(() => AgentIdentity)
  agentIdentity?: AgentIdentity;

  // OJO: NO hay HasMany UGCPostComment registrado (el "lazy import" nunca existio).
  // Un include con alias "comments" fallaria con 500. Declararlo aqui si se necesita.
  // La relacion se declara en el init del modelo

  // --- Metodos auxiliares ---

  isDraft(): boolean {
    return this.status === "draft";
  }

  isPublished(): boolean {
    return this.status === "published";
  }

  isScheduled(): boolean {
    return this.status === "scheduled";
  }

  getTotalEngagement(): number {
    return this.likes + this.comments + this.shares + this.saves;
  }

  async publish(platformPostId: string): Promise<void> {
    this.status = "published";
    this.platformPostId = platformPostId;
    this.publishedAt = new Date();
    await this.save();
  }

  async markAsFailed(): Promise<void> {
    this.status = "failed";
    await this.save();
  }

  async updateMetrics(metrics: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    reachCount?: number;
    impressionCount?: number;
    engagementRate?: number;
  }): Promise<void> {
    if (metrics.views !== undefined) this.views = metrics.views;
    if (metrics.likes !== undefined) this.likes = metrics.likes;
    if (metrics.comments !== undefined) this.comments = metrics.comments;
    if (metrics.shares !== undefined) this.shares = metrics.shares;
    if (metrics.saves !== undefined) this.saves = metrics.saves;
    if (metrics.reachCount !== undefined) this.reachCount = metrics.reachCount;
    if (metrics.impressionCount !== undefined) this.impressionCount = metrics.impressionCount;
    if (metrics.engagementRate !== undefined) this.engagementRate = metrics.engagementRate;
    this.lastMetricsSyncAt = new Date();
    await this.save();
  }

  async archive(): Promise<void> {
    this.status = "archived";
    await this.save();
  }
}

export default UGCSocialPost;
