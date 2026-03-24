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

@Table({
  tableName: "AIAgentLogs",
  timestamps: false
})
class AIAgentLog extends Model<AIAgentLog> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @Index
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  companyId!: number;

  @Column(DataType.INTEGER)
  ticketId!: number;

  @Column(DataType.INTEGER)
  contactId!: number;

  @Index
  @Column({
    type: DataType.STRING(50),
    allowNull: false
  })
  agentType!: string;

  @Column(DataType.STRING(100))
  modelUsed!: string;

  @Default(0)
  @Column(DataType.INTEGER)
  inputTokens!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  outputTokens!: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 6))
  costUsd!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  latencyMs!: number;

  @Column(DataType.DECIMAL(3, 2))
  confidence!: number;

  @Default(false)
  @Column(DataType.BOOLEAN)
  wasEscalated!: boolean;

  @Column(DataType.STRING(255))
  escalationReason!: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  cacheHit!: boolean;

  @Default([])
  @Column(DataType.JSONB)
  toolsUsed!: string[];

  @Column(DataType.TEXT)
  inputSummary!: string;

  @Column(DataType.TEXT)
  outputSummary!: string;

  @Default({})
  @Column(DataType.JSONB)
  metadata!: Record<string, unknown>;

  @CreatedAt
  createdAt!: Date;

  @BelongsTo(() => Company)
  company!: Company;
}

export default AIAgentLog;
