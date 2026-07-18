import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  HasMany,
  DataType,
  AllowNull,
  Default,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";
import Whatsapp from "./Whatsapp";
import MetaAgentActionLog from "./MetaAgentActionLog";

export type MetaAgentPlanStatus =
  | "pending"
  | "executed"
  | "partial"
  | "expired"
  | "rejected";

export interface ProposedAction {
  id: string;          // uuid local del plan, para selección parcial en /execute
  action:
    | "pause_campaign"
    | "update_campaign_budget"
    | "duplicate_campaign"
    | "create_campaign_paused";
  params: Record<string, unknown>;
  reason: string;      // explicación del agente, mostrada al usuario
  riskLevel: "low" | "medium" | "high";
  estimatedImpact?: string;
}

@Table({ tableName: "MetaAgentPlans" })
class MetaAgentPlan extends Model<MetaAgentPlan> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @AllowNull(true)
  @ForeignKey(() => Whatsapp)
  @Column(DataType.INTEGER)
  whatsappId: number | null;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  // Snapshot de credenciales resueltas en el momento del plan.
  // Si cambian entre plan y execute, se rechaza con STALE_CREDENTIALS.
  @AllowNull(true)
  @Column(DataType.STRING(64))
  resolvedAdAccountId: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(20))
  resolvedMode: "whatsapp" | "company_settings" | null;

  @Column(DataType.TEXT)
  prompt: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  summary: string | null;

  @Default([])
  @Column(DataType.JSONB)
  proposedActions: ProposedAction[];

  @Default("pending")
  @Column(DataType.STRING(20))
  status: MetaAgentPlanStatus;

  @Column(DataType.DATE)
  expiresAt: Date;

  @AllowNull(true)
  @Column(DataType.DATE)
  executedAt: Date | null;

  @AllowNull(true)
  @Column(DataType.JSONB)
  openaiUsage: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    model?: string;
  } | null;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => MetaAgentActionLog)
  actionLogs: MetaAgentActionLog[];
}

export default MetaAgentPlan;
