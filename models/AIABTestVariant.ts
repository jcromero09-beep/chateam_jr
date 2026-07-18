import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  DataType,
  Default,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";
import AIABTest from "./AIABTest";

@Table({ tableName: "AIABTestVariants" })
class AIABTestVariant extends Model<AIABTestVariant> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => AIABTest)
  @Column(DataType.INTEGER)
  testId: number;

  @Column(DataType.INTEGER)
  companyId: number;

  @Column(DataType.STRING(100))
  name: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isControl: boolean;

  @Default({})
  @Column(DataType.JSONB)
  config: Record<string, unknown>;

  @Default(0)
  @Column(DataType.INTEGER)
  impressions: number;

  @Default(0)
  @Column(DataType.INTEGER)
  conversions: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  avgLatencyMs: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 6))
  avgCostUsd: number;

  @Default(0)
  @Column(DataType.DECIMAL(3, 2))
  avgCsat: number;

  @Default(0)
  @Column(DataType.INTEGER)
  escalationCount: number;

  @Default(0)
  @Column(DataType.INTEGER)
  resolutionCount: number;

  @Default(0)
  @Column(DataType.BIGINT)
  totalTokensUsed: number;

  @Default({})
  @Column(DataType.JSONB)
  metadata: Record<string, unknown>;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsTo(() => AIABTest)
  test: AIABTest;
}

export default AIABTestVariant;
