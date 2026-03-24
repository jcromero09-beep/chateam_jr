import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  Default,
  HasMany,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";
import AISpan from "./AISpan";

@Table({ tableName: "AITraces" })
class AITrace extends Model<AITrace> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column(DataType.INTEGER)
  companyId: number;

  @Column(DataType.STRING(64))
  traceId: string;

  @Column(DataType.STRING(100))
  name: string;

  @Column(DataType.STRING(100))
  sessionId: string;

  @Column(DataType.INTEGER)
  userId: number;

  @Column(DataType.INTEGER)
  ticketId: number;

  @Column(DataType.INTEGER)
  contactId: number;

  @Default({})
  @Column(DataType.JSONB)
  input: Record<string, unknown>;

  @Default({})
  @Column(DataType.JSONB)
  output: Record<string, unknown>;

  @Default({})
  @Column(DataType.JSONB)
  metadata: Record<string, unknown>;

  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  tags: string[];

  @Default("running")
  @Column(DataType.STRING(20))
  status: "running" | "completed" | "error";

  @Default(0)
  @Column(DataType.INTEGER)
  totalTokensInput: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalTokensOutput: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 6))
  totalCostUsd: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalLatencyMs: number;

  @Column(DataType.DATE)
  startedAt: Date;

  @Column(DataType.DATE)
  completedAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => AISpan, { foreignKey: "traceId", sourceKey: "traceId" })
  spans: AISpan[];
}

export default AITrace;
