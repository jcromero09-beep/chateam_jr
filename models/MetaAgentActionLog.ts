import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  DataType,
  AllowNull,
  Default,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";
import Company from "./Company";
import MetaAgentPlan from "./MetaAgentPlan";

@Table({ tableName: "MetaAgentActionLogs" })
class MetaAgentActionLog extends Model<MetaAgentActionLog> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => MetaAgentPlan)
  @Column(DataType.INTEGER)
  planId: number;

  @BelongsTo(() => MetaAgentPlan)
  plan: MetaAgentPlan;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Column(DataType.STRING(50))
  action:
    | "pause_campaign"
    | "update_campaign_budget"
    | "duplicate_campaign"
    | "create_campaign_paused";

  @Default({})
  @Column(DataType.JSONB)
  params: Record<string, unknown>;

  @Default(false)
  @Column(DataType.BOOLEAN)
  success: boolean;

  @AllowNull(true)
  @Column(DataType.TEXT)
  errorMessage: string | null;

  @AllowNull(true)
  @Column(DataType.JSONB)
  metaResponse: Record<string, unknown> | null;

  @Column(DataType.DATE)
  executedAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default MetaAgentActionLog;
