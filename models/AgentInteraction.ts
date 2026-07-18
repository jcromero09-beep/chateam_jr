/**
 * Model: AgentInteraction
 * Tracks each social media interaction performed by an agent identity
 * through a physical device in the farm.
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
import AgentIdentity from "./AgentIdentity";
import AgentDevice from "./AgentDevice";

// Tipo de interaccion en redes sociales
export type InteractionType =
  | "comment"
  | "reply"
  | "like"
  | "follow"
  | "unfollow"
  | "dm"
  | "post"
  | "share"
  | "story_view";

// Plataforma de la interaccion
export type InteractionPlatform = "instagram" | "tiktok" | "facebook" | "youtube";

// Sentimiento detectado en la interaccion
export type InteractionSentiment = "positive" | "neutral" | "negative" | "purchase_intent";

// Estado de ejecucion de la interaccion
export type InteractionExecutionStatus =
  | "pending"
  | "scheduled"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

@Table({
  tableName: "AgentInteractions",
  timestamps: true
})
class AgentInteraction extends Model<AgentInteraction> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_agent_interactions_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @ForeignKey(() => AgentIdentity)
  @AllowNull(false)
  @Index("idx_agent_interactions_identity")
  @Column(DataType.INTEGER)
  agentIdentityId!: number;

  @ForeignKey(() => AgentDevice)
  @AllowNull(true)
  @Index("idx_agent_interactions_device")
  @Column(DataType.INTEGER)
  agentDeviceId?: number;

  @AllowNull(false)
  @Index("idx_agent_interactions_type")
  @Column(DataType.STRING(50))
  type!: InteractionType;

  @AllowNull(false)
  @Index("idx_agent_interactions_platform")
  @Column(DataType.STRING(50))
  platform!: InteractionPlatform;

  @AllowNull(true)
  @Column(DataType.TEXT)
  content?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  targetPostId?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  targetUserId?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  targetCommentId?: string;

  @AllowNull(true)
  @Index("idx_agent_interactions_sentiment")
  @Column(DataType.STRING(50))
  sentiment?: InteractionSentiment;

  @AllowNull(true)
  @Column(DataType.DECIMAL(3, 2))
  consistencyScore?: number;

  @AllowNull(true)
  @Column(DataType.DATE)
  executedAt?: Date;

  @Default("pending")
  @AllowNull(false)
  @Index("idx_agent_interactions_exec_status")
  @Column(DataType.STRING(50))
  executionStatus!: InteractionExecutionStatus;

  @AllowNull(true)
  @Column(DataType.TEXT)
  failureReason?: string;

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

  @BelongsTo(() => AgentIdentity)
  agentIdentity!: AgentIdentity;

  @BelongsTo(() => AgentDevice)
  agentDevice?: AgentDevice;

  // --- Metodos auxiliares ---

  isPending(): boolean {
    return this.executionStatus === "pending";
  }

  isCompleted(): boolean {
    return this.executionStatus === "completed";
  }

  isFailed(): boolean {
    return this.executionStatus === "failed";
  }

  async markAsExecuting(): Promise<void> {
    this.executionStatus = "executing";
    await this.save();
  }

  async markAsCompleted(): Promise<void> {
    this.executionStatus = "completed";
    this.executedAt = new Date();
    await this.save();
  }

  async markAsFailed(reason: string): Promise<void> {
    this.executionStatus = "failed";
    this.failureReason = reason;
    await this.save();
  }

  async cancel(): Promise<void> {
    this.executionStatus = "cancelled";
    await this.save();
  }
}

export default AgentInteraction;
