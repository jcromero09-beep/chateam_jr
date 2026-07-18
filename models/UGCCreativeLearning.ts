/**
 * Model: UGCCreativeLearning
 * Insights extracted by the autonomous feedback loop.
 * Captures patterns, anti-patterns, and recommendations
 * from campaign performance data for continuous optimization.
 * Updated in Phase 3 with evidence, appliedResult, source, extractedBy, isActive.
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

// Tipos de aprendizaje que el sistema puede extraer
export type LearningType =
  | "content_style"
  | "posting_time"
  | "audience_segment"
  | "hashtag"
  | "hook_pattern"
  | "cta_pattern"
  | "avatar_preference"
  | "platform_specific"
  | "engagement_tactic"
  | "anti_pattern";

// Nivel de impacto del aprendizaje
export type LearningImpact = "high" | "medium" | "low";

// Fuente de donde se extrajo el aprendizaje
export type LearningSource = "feedback_loop" | "manual" | "ai_analysis";

@Table({
  tableName: "UGCCreativeLearnings",
  timestamps: true
})
class UGCCreativeLearning extends Model<UGCCreativeLearning> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_ugc_creative_learnings_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @ForeignKey(() => UGCCampaign)
  @AllowNull(true)
  @Index("idx_ugc_creative_learnings_campaign")
  @Column(DataType.INTEGER)
  campaignId?: number;

  @AllowNull(false)
  @Index("idx_ugc_creative_learnings_type")
  @Column(DataType.STRING(50))
  learningType!: LearningType;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  title!: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  description!: string;

  @Default({})
  @AllowNull(true)
  @Column(DataType.JSONB)
  evidence!: Record<string, unknown>;

  @Default("medium")
  @AllowNull(false)
  @Index("idx_ugc_creative_learnings_impact")
  @Column(DataType.STRING(50))
  impact!: LearningImpact;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(3, 2))
  confidence!: number;

  @AllowNull(true)
  @Column(DataType.TEXT)
  recommendation?: string;

  @AllowNull(true)
  @Column(DataType.DATE)
  appliedAt?: Date;

  @AllowNull(true)
  @Column(DataType.JSONB)
  appliedResult?: Record<string, unknown>;

  @Default("feedback_loop")
  @AllowNull(false)
  @Index("idx_ugc_creative_learnings_source")
  @Column(DataType.STRING(50))
  source!: LearningSource;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  extractedBy?: string;

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
  campaign?: UGCCampaign;

  // --- Metodos auxiliares ---

  isHighImpact(): boolean {
    return this.impact === "high";
  }

  isHighConfidence(threshold: number = 0.8): boolean {
    return Number(this.confidence) >= threshold;
  }

  isGlobal(): boolean {
    return this.campaignId === null || this.campaignId === undefined;
  }

  wasApplied(): boolean {
    return this.appliedAt !== null && this.appliedAt !== undefined;
  }

  isAntiPattern(): boolean {
    return this.learningType === "anti_pattern";
  }

  async apply(result?: Record<string, unknown>): Promise<void> {
    this.appliedAt = new Date();
    if (result) {
      this.appliedResult = result;
    }
    await this.save();
  }

  async deactivate(): Promise<void> {
    this.isActive = false;
    await this.save();
  }

  async reactivate(): Promise<void> {
    this.isActive = true;
    await this.save();
  }
}

export default UGCCreativeLearning;
