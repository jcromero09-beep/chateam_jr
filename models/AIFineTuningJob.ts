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

@Table({ tableName: "AIFineTuningJobs" })
class AIFineTuningJob extends Model<AIFineTuningJob> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column(DataType.INTEGER)
  companyId: number;

  @Column(DataType.STRING(100))
  jobId: string;

  @Default("openai")
  @Column(DataType.STRING(30))
  provider: string;

  @Column(DataType.STRING(60))
  baseModel: string;

  @Column(DataType.STRING(120))
  fineTunedModel: string;

  @Column(DataType.STRING(100))
  trainingFileId: string;

  @Column(DataType.STRING(100))
  validationFileId: string;

  @Default("pending")
  @Column(DataType.STRING(30))
  status: "pending" | "preparing" | "uploading" | "training" | "succeeded" | "failed" | "cancelled";

  @Default({ n_epochs: 3, batch_size: "auto", learning_rate_multiplier: "auto" })
  @Column(DataType.JSONB)
  hyperparameters: Record<string, unknown>;

  @Default(0)
  @Column(DataType.INTEGER)
  trainingSamples: number;

  @Default(0)
  @Column(DataType.INTEGER)
  validationSamples: number;

  @Default(0)
  @Column(DataType.INTEGER)
  trainedTokens: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 4))
  estimatedCostUsd: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 4))
  actualCostUsd: number;

  @Column(DataType.TEXT)
  errorMessage: string;

  @Default("tickets")
  @Column(DataType.STRING(30))
  dataSource: "tickets" | "kb" | "manual" | "mixed";

  @Default({})
  @Column(DataType.JSONB)
  metadata: Record<string, unknown>;

  @Column(DataType.DATE)
  startedAt: Date;

  @Column(DataType.DATE)
  completedAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AIFineTuningJob;
