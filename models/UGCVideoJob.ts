/**
 * Model: UGCVideoJob
 * Tracks an individual video generation job through the full pipeline:
 * script -> avatar -> video -> composition -> review -> completed/failed.
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
import UGCCampaign from "./UGCCampaign";
import UGCVideoAsset from "./UGCVideoAsset";

// Etapas del pipeline de generacion de video
export type UGCVideoJobStage =
  | "script_generation"
  | "avatar_generation"
  | "video_generation"
  | "composition"
  | "review"
  | "completed"
  | "failed";

// Estados de ejecucion del job
export type UGCVideoJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

// Entrada en el log del pipeline
export interface PipelineLogEntry {
  stage: UGCVideoJobStage;
  status: UGCVideoJobStatus;
  message: string;
  timestamp: string;
  durationMs?: number;
  provider?: string;
  error?: string;
}

// Detalles del score creativo
export interface ScoreDetails {
  hookStrength?: number;
  scriptQuality?: number;
  visualAppeal?: number;
  audioQuality?: number;
  callToAction?: number;
  authenticity?: number;
  overall?: number;
}

@Table({
  tableName: "UGCVideoJobs",
  timestamps: true
})
class UGCVideoJob extends Model<UGCVideoJob> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_ugc_video_jobs_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  // Nullable: los jobs standalone (playground multi-proveedor) no tienen campaña.
  @ForeignKey(() => UGCCampaign)
  @AllowNull(true)
  @Index("idx_ugc_video_jobs_campaign")
  @Column(DataType.INTEGER)
  ugcCampaignId?: number | null;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  userId!: number;

  @Default("script_generation")
  @AllowNull(false)
  @Index("idx_ugc_video_jobs_stage")
  @Column(DataType.STRING(50))
  stage!: UGCVideoJobStage;

  @Default("pending")
  @AllowNull(false)
  @Index("idx_ugc_video_jobs_status")
  @Column(DataType.STRING(50))
  status!: UGCVideoJobStatus;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  progress!: number;

  @AllowNull(true)
  @Column(DataType.TEXT)
  script?: string;

  @Default(1)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  scriptVersion!: number;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  avatarProvider?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  avatarId?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  avatarVideoUrl?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  videoProvider?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  videoProviderJobId?: string;

  // --- Generación standalone (playground multi-proveedor) ---

  // Proveedor de generación: "higgsfield" | "fal" (null = legacy de campaña).
  @AllowNull(true)
  @Index("idx_ugc_video_jobs_provider")
  @Column(DataType.STRING(50))
  provider?: string;

  // "image" | "video".
  @AllowNull(true)
  @Column(DataType.STRING(20))
  mediaType?: string;

  // Id de modelo normalizado usado en la generación.
  @AllowNull(true)
  @Column(DataType.STRING(120))
  modelKey?: string;

  // Preset/estilo cinema seleccionado (ej. "drama").
  @AllowNull(true)
  @Column(DataType.STRING(120))
  styleId?: string;

  // Clave de idempotencia por (companyId, idempotencyKey).
  @AllowNull(true)
  @Index("idx_ugc_video_jobs_idem")
  @Column(DataType.STRING(120))
  idempotencyKey?: string;

  // Prompt del playground (distinto del `script` de campaña).
  @AllowNull(true)
  @Column(DataType.TEXT)
  promptText?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  rawVideoUrl?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  compositorProvider?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  finalVideoUrl?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  thumbnailUrl?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  fileName?: string;

  @AllowNull(true)
  @Column(DataType.BIGINT)
  fileSize?: number;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  duration?: number;

  @Default("video/mp4")
  @AllowNull(false)
  @Column(DataType.STRING(255))
  mimeType!: string;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(10, 2))
  totalCreditsUsed!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(10, 4))
  totalCostUsd!: number;

  @AllowNull(true)
  @Column(DataType.DECIMAL(5, 2))
  creativeScore?: number;

  @AllowNull(true)
  @Column(DataType.JSONB)
  scoreDetails?: ScoreDetails;

  @AllowNull(true)
  @Column(DataType.TEXT)
  errorMessage?: string;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  retryCount!: number;

  @Default([])
  @AllowNull(true)
  @Column(DataType.JSONB)
  pipelineLog!: PipelineLogEntry[];

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

  @BelongsTo(() => User)
  user!: User;

  @BelongsTo(() => UGCCampaign)
  ugcCampaign!: UGCCampaign;

  @HasMany(() => UGCVideoAsset)
  assets!: UGCVideoAsset[];

  // --- Metodos auxiliares ---

  isCompleted(): boolean {
    return this.status === "completed";
  }

  isFailed(): boolean {
    return this.status === "failed";
  }

  isProcessing(): boolean {
    return this.status === "processing";
  }

  isPending(): boolean {
    return this.status === "pending";
  }

  async advanceStage(nextStage: UGCVideoJobStage): Promise<void> {
    this.addLogEntry(this.stage, "completed", `Stage ${this.stage} completed`);
    this.stage = nextStage;
    this.status = "processing";
    await this.save();
  }

  async markAsCompleted(): Promise<void> {
    this.stage = "completed";
    this.status = "completed";
    this.progress = 100;
    this.addLogEntry("completed", "completed", "Pipeline completed successfully");
    await this.save();
  }

  async markAsFailed(errorMessage: string): Promise<void> {
    this.stage = "failed";
    this.status = "failed";
    this.errorMessage = errorMessage;
    this.addLogEntry("failed", "failed", errorMessage);
    await this.save();
  }

  async updateProgress(progress: number): Promise<void> {
    this.progress = progress;
    await this.save();
  }

  addLogEntry(
    stage: UGCVideoJobStage,
    status: UGCVideoJobStatus,
    message: string,
    extra?: Partial<PipelineLogEntry>
  ): void {
    if (!this.pipelineLog) this.pipelineLog = [];
    this.pipelineLog.push({
      stage,
      status,
      message,
      timestamp: new Date().toISOString(),
      ...extra
    });
    // Marca el campo como cambiado para que Sequelize lo persista
    this.changed("pipelineLog", true);
  }
}

export default UGCVideoJob;
