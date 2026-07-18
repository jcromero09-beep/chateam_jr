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
  Default,
  Index
} from "sequelize-typescript";
import Company from "./Company";
import CampaignRule from "./CampaignRule";

@Table({
  tableName: "CampaignRuleLogs",
  timestamps: false
})
class CampaignRuleLog extends Model<CampaignRuleLog> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => CampaignRule)
  @Index
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  ruleId!: number;

  @ForeignKey(() => Company)
  @Index
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  companyId!: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: true
  })
  campaignId!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: true
  })
  campaignName!: string;

  @Default(DataType.NOW)
  @Index
  @Column({
    type: DataType.DATE,
    allowNull: false
  })
  executedAt!: Date;

  @Default(false)
  @Column({
    type: DataType.BOOLEAN,
    allowNull: false
  })
  conditionsMet!: boolean;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    comment: "Snapshot de métricas al momento de evaluar"
  })
  metricsSnapshot!: Record<string, number>;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    comment: "Acciones que se ejecutaron y su resultado"
  })
  actionsTaken!: Array<{ type: string; result: string; details?: string }>;

  @Default("skipped")
  @Column({
    type: DataType.ENUM("success", "failed", "skipped", "cooldown"),
    allowNull: false
  })
  result!: "success" | "failed" | "skipped" | "cooldown";

  @Column({
    type: DataType.TEXT,
    allowNull: true
  })
  error!: string;

  @Default(0)
  @Column(DataType.INTEGER)
  notificationsSent!: number;

  @CreatedAt
  createdAt!: Date;

  // Relaciones
  @BelongsTo(() => CampaignRule)
  rule!: CampaignRule;

  @BelongsTo(() => Company)
  company!: Company;
}

export default CampaignRuleLog;
