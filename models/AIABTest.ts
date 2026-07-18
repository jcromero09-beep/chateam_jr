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
import AIABTestVariant from "./AIABTestVariant";

@Table({ tableName: "AIABTests" })
class AIABTest extends Model<AIABTest> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column(DataType.INTEGER)
  companyId: number;

  @Column(DataType.STRING(150))
  name: string;

  @Column(DataType.TEXT)
  description: string;

  @Default("prompt")
  @Column(DataType.STRING(30))
  testType: "prompt" | "model" | "temperature" | "system_message" | "rag_config" | "classifier_prompt";

  @Column(DataType.STRING(30))
  agentType: string;

  @Default("draft")
  @Column(DataType.STRING(20))
  status: "draft" | "running" | "paused" | "completed" | "archived";

  @Default({})
  @Column(DataType.JSONB)
  trafficSplit: Record<string, number>;

  @Column(DataType.INTEGER)
  winnerVariantId: number;

  @Default(100)
  @Column(DataType.INTEGER)
  minSampleSize: number;

  @Default(0.95)
  @Column(DataType.DECIMAL(3, 2))
  confidenceLevel: number;

  @Default("resolution_rate")
  @Column(DataType.STRING(30))
  primaryMetric: "resolution_rate" | "csat" | "latency" | "cost" | "escalation_rate" | "engagement";

  @Default(0)
  @Column(DataType.INTEGER)
  totalImpressions: number;

  @Column(DataType.DATE)
  startedAt: Date;

  @Column(DataType.DATE)
  completedAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => AIABTestVariant)
  variants: AIABTestVariant[];
}

export default AIABTest;
