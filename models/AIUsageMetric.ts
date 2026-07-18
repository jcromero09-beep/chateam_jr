import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  Default,
  CreatedAt
} from "sequelize-typescript";

@Table({ tableName: "AIUsageMetrics", timestamps: false })
class AIUsageMetric extends Model<AIUsageMetric> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column(DataType.INTEGER)
  companyId: number;

  @Column(DataType.DATEONLY)
  date: string;

  @Default("daily")
  @Column(DataType.STRING(10))
  period: "daily" | "weekly" | "monthly";

  // Métricas de uso
  @Default(0)
  @Column(DataType.INTEGER)
  totalMessages: number;

  @Default(0)
  @Column(DataType.INTEGER)
  aiMessages: number;

  @Default(0)
  @Column(DataType.INTEGER)
  humanMessages: number;

  @Default(0)
  @Column(DataType.INTEGER)
  aiResolutions: number;

  @Default(0)
  @Column(DataType.INTEGER)
  escalations: number;

  // Métricas de agentes
  @Default(0)
  @Column(DataType.INTEGER)
  routerCalls: number;

  @Default(0)
  @Column(DataType.INTEGER)
  ragCalls: number;

  @Default(0)
  @Column(DataType.INTEGER)
  salesCalls: number;

  @Default(0)
  @Column(DataType.INTEGER)
  supportCalls: number;

  @Default(0)
  @Column(DataType.INTEGER)
  escalationCalls: number;

  // Métricas de costo
  @Default(0)
  @Column(DataType.BIGINT)
  totalTokensInput: number;

  @Default(0)
  @Column(DataType.BIGINT)
  totalTokensOutput: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 4))
  totalCostUsd: number;

  // Métricas de rendimiento
  @Default(0)
  @Column(DataType.INTEGER)
  avgLatencyMs: number;

  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  cacheHitRate: number;

  @Default(0)
  @Column(DataType.DECIMAL(3, 2))
  avgConfidence: number;

  // Métricas de negocio
  @Default(0)
  @Column(DataType.INTEGER)
  newCompanies: number;

  @Default(0)
  @Column(DataType.INTEGER)
  activeCompanies: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  mrrUsd: number;

  @CreatedAt
  createdAt: Date;
}

export default AIUsageMetric;
