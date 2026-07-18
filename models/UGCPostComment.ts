/**
 * Model: UGCPostComment
 * Represents a comment received on a social media publication,
 * classified by AI for sentiment, purchase intent, and auto-reply management.
 * Supports nested replies via self-referencing parentCommentId.
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
import UGCSocialPost from "./UGCSocialPost";
import AgentIdentity from "./AgentIdentity";
import Whatsapp from "./Whatsapp";

// Tipo de comentario clasificado por IA
export type CommentType =
  | "purchase_intent"
  | "question"
  | "praise"
  | "complaint"
  | "neutral"
  | "spam";

// Sentimiento del comentario
export type CommentSentiment = "positive" | "neutral" | "negative";

// Estado de la respuesta automatica generada por el agente
export type AutoReplyStatus =
  | "pending"
  | "generating"
  | "generated"
  | "sent"
  | "failed"
  | "skipped";

// Plataforma del comentario
export type CommentPlatform = "instagram" | "tiktok" | "facebook" | "youtube";

@Table({
  tableName: "UGCPostComments",
  timestamps: true
})
class UGCPostComment extends Model<UGCPostComment> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_ugc_post_comments_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @ForeignKey(() => UGCSocialPost)
  @AllowNull(false)
  @Index("idx_ugc_post_comments_post")
  @Column(DataType.INTEGER)
  socialPostId!: number;

  @ForeignKey(() => AgentIdentity)
  @AllowNull(true)
  @Index("idx_ugc_post_comments_agent")
  @Column(DataType.INTEGER)
  assignedAgentIdentityId?: number;

  @AllowNull(false)
  @Index("idx_ugc_post_comments_platform_id")
  @Column(DataType.STRING(255))
  platformCommentId!: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  authorUsername!: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  authorDisplayName?: string;

  @AllowNull(true)
  @Column(DataType.STRING(1024))
  authorProfileImageUrl?: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  content!: string;

  @ForeignKey(() => UGCPostComment)
  @AllowNull(true)
  @Index("idx_ugc_post_comments_parent")
  @Column(DataType.INTEGER)
  parentCommentId?: number;

  @Default("neutral")
  @AllowNull(false)
  @Index("idx_ugc_post_comments_type")
  @Column(DataType.STRING(50))
  commentType!: CommentType;

  @Default("neutral")
  @AllowNull(false)
  @Index("idx_ugc_post_comments_sentiment")
  @Column(DataType.STRING(50))
  sentiment!: CommentSentiment;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(3, 2))
  purchaseIntentScore!: number;

  @AllowNull(true)
  @Column(DataType.TEXT)
  autoReplyContent?: string;

  @Default("pending")
  @AllowNull(false)
  @Index("idx_ugc_post_comments_reply_status")
  @Column(DataType.STRING(50))
  autoReplyStatus!: AutoReplyStatus;

  @AllowNull(true)
  @Column(DataType.DATE)
  autoRepliedAt?: Date;

  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  whatsappTriggered!: boolean;

  @AllowNull(true)
  @Column(DataType.DATE)
  classifiedAt?: Date;

  @AllowNull(true)
  @Column(DataType.STRING(100))
  classifiedBy?: string;

  @AllowNull(false)
  @Index("idx_ugc_post_comments_platform")
  @Column(DataType.STRING(50))
  platform!: CommentPlatform;

  @AllowNull(true)
  @Column(DataType.DATE)
  postedAt?: Date;

  // Campos adicionales para TikTok
  @Default(false)
  @AllowNull(false)
  @Index("idx_ugc_post_comments_from_me")
  @Column(DataType.BOOLEAN)
  fromMe!: boolean;

  @ForeignKey(() => Whatsapp)
  @AllowNull(true)
  @Index("idx_ugc_post_comments_whatsapp")
  @Column(DataType.INTEGER)
  whatsappId?: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  likeCount!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  replyCount!: number;

  // Moderación Facebook/Instagram (soft flags — BD SAGRADA: nunca DELETE físico)
  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  isHidden!: boolean;

  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  isDeleted!: boolean;

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

  @BelongsTo(() => UGCSocialPost)
  socialPost!: UGCSocialPost;

  @BelongsTo(() => AgentIdentity, "assignedAgentIdentityId")
  assignedAgent?: AgentIdentity;

  @BelongsTo(() => UGCPostComment, "parentCommentId")
  parentComment?: UGCPostComment;

  @BelongsTo(() => Whatsapp, "whatsappId")
  whatsapp?: Whatsapp;

  @HasMany(() => UGCPostComment, "parentCommentId")
  replies!: UGCPostComment[];

  // --- Metodos auxiliares ---

  isOwnReply(): boolean {
    return this.fromMe === true;
  }

  isPurchaseIntent(): boolean {
    return this.commentType === "purchase_intent" || Number(this.purchaseIntentScore) >= 0.7;
  }

  isQuestion(): boolean {
    return this.commentType === "question";
  }

  isSpam(): boolean {
    return this.commentType === "spam";
  }

  needsReply(): boolean {
    return this.autoReplyStatus === "pending" && this.commentType !== "spam";
  }

  isReply(): boolean {
    return this.parentCommentId !== null && this.parentCommentId !== undefined;
  }

  isClassified(): boolean {
    return this.classifiedAt !== null && this.classifiedAt !== undefined;
  }

  async classify(type: CommentType, sentimentValue: CommentSentiment, intentScore: number, by: string): Promise<void> {
    this.commentType = type;
    this.sentiment = sentimentValue;
    this.purchaseIntentScore = intentScore;
    this.classifiedAt = new Date();
    this.classifiedBy = by;
    await this.save();
  }

  async setAutoReply(content: string): Promise<void> {
    this.autoReplyContent = content;
    this.autoReplyStatus = "generated";
    await this.save();
  }

  async markReplySent(): Promise<void> {
    this.autoReplyStatus = "sent";
    this.autoRepliedAt = new Date();
    await this.save();
  }

  async markReplyFailed(): Promise<void> {
    this.autoReplyStatus = "failed";
    await this.save();
  }

  async skipReply(): Promise<void> {
    this.autoReplyStatus = "skipped";
    await this.save();
  }

  async triggerWhatsapp(): Promise<void> {
    this.whatsappTriggered = true;
    await this.save();
  }
}

export default UGCPostComment;
