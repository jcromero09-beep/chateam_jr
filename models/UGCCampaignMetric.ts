/**
 * Model: UGCCampaignMetric
 * Hourly snapshot of campaign metrics for the autonomous feedback loop.
 * Aggregates views, engagement, ROAS, and platform breakdown data.
 * Updated in Phase 3 with cost metrics, agent tracking, and top content.
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
  tableName: "UGCCampaignMetrics",
  timestamps: true,
  indexes: [
    {
      name: "idx_ugc_campaign_metrics_campaign_snapshot",
      fields: ["campaignId", "snapshotAt"]
    }
  ]
})
class UGCCampaignMetric extends Model<UGCCampaignMetric> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_ugc_campaign_metrics_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @ForeignKey(() => UGCCampaign)
  @AllowNull(false)
  @Index("idx_ugc_campaign_metrics_campaign")
  @Column(DataType.INTEGER)
  campaignId!: number;

  @AllowNull(false)
  @Column(DataType.DATE)
  snapshotAt!: Date;

  // --- Metricas de alcance ---

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  totalViews!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  totalLikes!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  totalComments!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  totalShares!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(5, 2))
  totalEngagement!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  totalReach!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  totalImpressions!: number;

  // --- Metricas de conversion ---

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
  @Column(DataType.INTEGER)
  newFollowers!: number;

  // --- Metricas de costo ---

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(8, 4))
  costPerView!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(8, 4))
  costPerEngagement!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(8, 2))
  roas!: number;

  // --- Metricas de campana ---

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  videoCount!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  activeAgentCount!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(5, 2))
  commentResponseRate!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(3, 2))
  avgConsistencyScore!: number;

  // --- Desglose por plataforma y top content ---

  @Default({})
  @AllowNull(true)
  @Column(DataType.JSONB)
  platformBreakdown!: Record<string, unknown>;

  @Default([])
  @AllowNull(true)
  @Column(DataType.JSONB)
  topPerformingContent!: Record<string, unknown>[];

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
  campaign!: UGCCampaign;

  // --- Metodos auxiliares ---

  getTotalInteractions(): number {
    return this.totalLikes + this.totalComments + this.totalShares;
  }

  hasHighEngagement(threshold: number = 5.0): boolean {
    return Number(this.totalEngagement) >= threshold;
  }

  isPositiveROAS(): boolean {
    return Number(this.roas) > 1.0;
  }
}

export default UGCCampaignMetric;
