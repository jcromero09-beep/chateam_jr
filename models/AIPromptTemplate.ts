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
  UpdatedAt,
  Default,
  Index
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";

export type PromptCategory =
  | 'customer_service'
  | 'sales'
  | 'support'
  | 'marketing'
  | 'general'
  | 'classification'
  | 'summarization'
  | 'translation'
  | 'custom';

@Table({
  tableName: "AIPromptTemplates",
  timestamps: true
})
class AIPromptTemplate extends Model<AIPromptTemplate> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @Index
  @Column(DataType.INTEGER)
  companyId!: number;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  createdBy!: number;

  @Column({
    type: DataType.STRING(100),
    allowNull: false
  })
  name!: string;

  @Column(DataType.TEXT)
  description!: string;

  @Index
  @Column({
    type: DataType.STRING(50),
    defaultValue: 'general'
  })
  category!: PromptCategory;

  @Column({
    type: DataType.TEXT,
    allowNull: false
  })
  systemPrompt!: string; // Prompt del sistema

  @Column(DataType.TEXT)
  userPromptTemplate!: string; // Template con variables {{variable}}

  @Default([])
  @Column(DataType.JSONB)
  variables!: Array<{
    name: string;
    description: string;
    required: boolean;
    defaultValue?: string;
  }>;

  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  tags!: string[];

  // Configuracion del modelo
  @Column(DataType.STRING(50))
  preferredModel!: string;

  @Default(1000)
  @Column(DataType.INTEGER)
  maxTokens!: number;

  @Default(0.7)
  @Column(DataType.DECIMAL(3, 2))
  temperature!: number;

  @Default(1)
  @Column(DataType.DECIMAL(3, 2))
  topP!: number;

  @Default(0)
  @Column(DataType.DECIMAL(3, 2))
  frequencyPenalty!: number;

  @Default(0)
  @Column(DataType.DECIMAL(3, 2))
  presencePenalty!: number;

  // Estadisticas de uso
  @Default(0)
  @Column(DataType.INTEGER)
  usageCount!: number;

  @Default(0)
  @Column(DataType.BIGINT)
  totalTokensUsed!: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 5))
  avgResponseTime!: number;

  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  successRate!: number;

  // Estado
  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isPublic!: boolean; // Compartido entre usuarios de la empresa

  @Default(false)
  @Column(DataType.BOOLEAN)
  isSystem!: boolean; // Template del sistema (no editable)

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => User)
  creator!: User;
}

export default AIPromptTemplate;
