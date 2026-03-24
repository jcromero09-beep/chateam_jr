import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  Default,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";
import Company from "./Company";
import AIAgentConfig from "./AIAgentConfig";

@Table({ tableName: "AIAgentAssignments" })
class AIAgentAssignment extends Model<AIAgentAssignment> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @ForeignKey(() => AIAgentConfig)
  @Column(DataType.INTEGER)
  agentConfigId: number;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive: boolean;

  @Default(DataType.NOW)
  @Column(DataType.DATE)
  assignedAt: Date;

  @Column(DataType.DATE)
  deactivatedAt: Date;

  @Default("included")
  @Column(DataType.STRING(30))
  pricingModel: "included" | "pay_per_execution" | "monthly_quota";

  @Default(0)
  @Column(DataType.INTEGER)
  executionQuota: number;

  @Default(0)
  @Column(DataType.INTEGER)
  executionsUsed: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  monthlyPrice: number;

  @Default({})
  @Column(DataType.JSONB)
  metadata: Record<string, unknown>;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => AIAgentConfig)
  agentConfig: AIAgentConfig;
}

export default AIAgentAssignment;
