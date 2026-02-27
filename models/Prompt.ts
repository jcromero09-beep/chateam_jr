import {
  AllowNull,
  AutoIncrement,
  BelongsTo,
  BelongsToMany,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
  UpdatedAt,
  DataType,
  Default
} from "sequelize-typescript";
import Queue from "./Queue";
import Company from "./Company";
import PromptQueue from "./PromptQueue";
import AIProviderConfig from "./AIProviderConfig";

@Table
class Prompt extends Model<Prompt> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @AllowNull(false)
  @Column(DataType.STRING)
  name: string;


  @AllowNull(false)
  @Column(DataType.STRING)
  prompt: string;



  @Column({ type: DataType.STRING, allowNull: true })
  get fileNameIA(): string | null {
    const val = this.getDataValue("fileNameIA");
    if (val) {
      return `${process.env.BACKEND_URL}${process.env.PROXY_PORT ? `:${process.env.PROXY_PORT}` : ""}/public/company${this.companyId}/ia/file${this.companyId}/${val}`;
    }
    return null;
  }

  set fileNameIA(value: string | null) {
    this.setDataValue("fileNameIA", value);
  }

  // Campo legacy - ahora opcional, usar aiProviderId en su lugar
  @AllowNull(true)
  @Column(DataType.STRING)
  apiKey: string;

  // ID del proveedor de IA configurado en /openai/settings
  @AllowNull(true)
  @ForeignKey(() => AIProviderConfig)
  @Column(DataType.INTEGER)
  aiProviderId: number;

  // URL base del proveedor de IA (copiado desde AIProviderConfig)
  @AllowNull(true)
  @Column(DataType.STRING(500))
  baseUrl: string;

  // Capacidades habilitadas (copiado desde AIProviderConfig al guardar)
  @AllowNull(true)
  @Column(DataType.JSONB)
  capabilities: {
    textGenerationEnabled: boolean;
    translationEnabled: boolean;
    imageGenerationEnabled: boolean;
    imageAnalysisEnabled: boolean;
    speechToTextEnabled: boolean;
  };

  @Column({ type: DataType.INTEGER, defaultValue: 10 })
  maxMessages: number;

  @Column({ type: DataType.INTEGER, defaultValue: 100 })
  maxTokens: number;

  @Column({ type: DataType.DECIMAL(3,2), defaultValue: 1 })
  temperature: number;

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  promptTokens: number;

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  completionTokens: number;

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  totalTokens: number;

  @Default("text")
  @AllowNull(false)
  @Column(DataType.STRING)
  voice: string;

  @AllowNull(true)
  @Column(DataType.STRING)
  voiceKey: string;

  @AllowNull(true)
  @Column(DataType.STRING)
  voiceRegion: string;

  @AllowNull
  @ForeignKey(() => Queue)
  @Column(DataType.INTEGER)
  queueId: number;

  @BelongsTo(() => Queue)
  queue: Queue;

  @BelongsToMany(() => Queue, () => PromptQueue)
  queues: Array<Queue & { PromptQueue: PromptQueue }>;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => AIProviderConfig)
  aiProvider: AIProviderConfig;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Prompt;
