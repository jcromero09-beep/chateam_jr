import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  Default,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";

type TaskType =
  | "kb_refresh"
  | "metrics_aggregation"
  | "ticket_auto_index"
  | "rss_ingest"
  | "cache_cleanup"
  | "credit_reset"
  | "fine_tuning_check"
  | "ab_test_evaluate"
  | "report_generate"
  | "custom";

@Table({ tableName: "AIScheduledTasks" })
class AIScheduledTask extends Model<AIScheduledTask> {
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

  @Column(DataType.STRING(40))
  taskType: TaskType;

  @Column(DataType.STRING(50))
  cronExpression: string;

  @Default({})
  @Column(DataType.JSONB)
  config: Record<string, unknown>;

  @Default("active")
  @Column(DataType.STRING(20))
  status: "active" | "paused" | "disabled" | "error";

  @Column(DataType.DATE)
  lastRunAt: Date;

  @Column(DataType.DATE)
  nextRunAt: Date;

  @Column(DataType.STRING(20))
  lastRunStatus: "success" | "error" | "timeout" | "skipped";

  @Column(DataType.INTEGER)
  lastRunDurationMs: number;

  @Column(DataType.TEXT)
  lastRunError: string;

  @Default(0)
  @Column(DataType.INTEGER)
  totalRuns: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalErrors: number;

  @Default(3)
  @Column(DataType.INTEGER)
  maxRetries: number;

  @Default(300000)
  @Column(DataType.INTEGER)
  timeoutMs: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AIScheduledTask;
