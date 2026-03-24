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

// Tipos de agentes disponibles
export type AIAgentType =
  | 'router'
  | 'rag'
  | 'sales'
  | 'support'
  | 'escalation'
  | 'supervisor'
  | 'content'
  | 'analytics'
  | 'multimedia'
  | 'security'
  | 'automation'
  | 'research';

// Departamentos del catálogo
export type AIAgentDepartment =
  | 'customer_service'
  | 'sales_crm'
  | 'marketing'
  | 'knowledge_rag'
  | 'automation'
  | 'analytics_bi'
  | 'multimedia'
  | 'security';

// Tier de modelo requerido
export type AIAgentTier = 'nano' | 'mini' | 'full' | 'premium';

@Table({
  tableName: "AIAgentConfigs",
  timestamps: true
})
class AIAgentConfig extends Model<AIAgentConfig> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @Index
  @Column(DataType.INTEGER)
  companyId!: number; // null = global

  @Index
  @Column({
    type: DataType.STRING(50),
    allowNull: false
  })
  agentType!: AIAgentType;

  @Column({
    type: DataType.STRING(255),
    allowNull: false
  })
  name!: string;

  @Column(DataType.TEXT)
  description!: string;

  @Column({
    type: DataType.STRING(100),
    allowNull: false
  })
  modelKey!: string; // Referencia a AIEntities.key

  @Column({
    type: DataType.TEXT,
    allowNull: false
  })
  systemPrompt!: string;

  @Default(0.7)
  @Column(DataType.DECIMAL(3, 2))
  temperature!: number;

  @Default(1024)
  @Column(DataType.INTEGER)
  maxTokens!: number;

  @Default([])
  @Column(DataType.JSONB)
  tools!: string[]; // Herramientas habilitadas

  @Default({})
  @Column(DataType.JSONB)
  guardrails!: Record<string, unknown>; // Configuración de guardrails

  @Default(0.7)
  @Column(DataType.DECIMAL(3, 2))
  confidenceThreshold!: number;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive!: boolean;

  @Default({})
  @Column(DataType.JSONB)
  metadata!: Record<string, unknown>;

  // --- Campos del Catálogo de Agentes ---

  @Index
  @Column(DataType.STRING(50))
  department!: string | null;

  @Column(DataType.STRING(50))
  category!: string | null;

  @Default([])
  @Column(DataType.JSONB)
  capabilities!: string[];

  @Default('bot')
  @Column(DataType.STRING(50))
  icon!: string;

  @Default('mini')
  @Column(DataType.STRING(20))
  tier!: string;

  @Column(DataType.STRING(100))
  slug!: string | null;

  @Default(0)
  @Column(DataType.INTEGER)
  sortOrder!: number;

  @Default('1.0.0')
  @Column(DataType.STRING(20))
  version!: string;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  @BelongsTo(() => Company)
  company!: Company;
}

export default AIAgentConfig;
