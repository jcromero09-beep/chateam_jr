import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  Default,
  BelongsTo,
  CreatedAt
} from "sequelize-typescript";
import AITrace from "./AITrace";

@Table({ tableName: "AISpans", timestamps: false })
class AISpan extends Model<AISpan> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column(DataType.STRING(64))
  traceId: string;

  @Column(DataType.STRING(64))
  spanId: string;

  @Column(DataType.STRING(64))
  parentSpanId: string;

  @Column(DataType.INTEGER)
  companyId: number;

  @Column(DataType.STRING(100))
  name: string;

  @Default("llm")
  @Column(DataType.STRING(30))
  type: "llm" | "retrieval" | "tool" | "agent" | "embedding" | "reranking" | "guard" | "custom";

  @Column(DataType.STRING(60))
  model: string;

  @Column(DataType.STRING(30))
  provider: string;

  @Default({})
  @Column(DataType.JSONB)
  input: Record<string, unknown>;

  @Default({})
  @Column(DataType.JSONB)
  output: Record<string, unknown>;

  @Default({})
  @Column(DataType.JSONB)
  metadata: Record<string, unknown>;

  @Default(0)
  @Column(DataType.INTEGER)
  tokensInput: number;

  @Default(0)
  @Column(DataType.INTEGER)
  tokensOutput: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 6))
  costUsd: number;

  @Default(0)
  @Column(DataType.INTEGER)
  latencyMs: number;

  @Default("running")
  @Column(DataType.STRING(20))
  status: "running" | "completed" | "error";

  @Column(DataType.TEXT)
  errorMessage: string;

  @Default("DEFAULT")
  @Column(DataType.STRING(10))
  level: "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";

  @Column(DataType.DATE)
  startedAt: Date;

  @Column(DataType.DATE)
  completedAt: Date;

  @CreatedAt
  createdAt: Date;

  @BelongsTo(() => AITrace, { foreignKey: "traceId", targetKey: "traceId" })
  trace: AITrace;
}

export default AISpan;
