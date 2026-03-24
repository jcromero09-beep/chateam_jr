import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  CreatedAt,
  UpdatedAt,
  Default,
  Unique,
  Index
} from "sequelize-typescript";

// Motor/proveedor del modelo IA
export type AIProviderEngine =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'deepseek'
  | 'mistral'
  | 'cohere'
  | 'azure'
  | 'meta'
  | 'groq'
  | 'xai'
  | 'openrouter'
  | 'stability'
  | 'elevenlabs'
  | 'local';

// Tipo de entidad IA
export type AIEntityType =
  | 'chat'
  | 'completion'
  | 'text'
  | 'embedding'
  | 'image'
  | 'audio'
  | 'video'
  | 'multimodal'
  | 'realtime'
  | 'code'
  | 'moderation'
  | 'tts'
  | 'stt';

@Table({
  tableName: "AIEntities",
  timestamps: true
})
class AIEntity extends Model<AIEntity> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @Unique
  @Index
  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  key!: string; // Identificador unico del modelo, ej: "gpt-4o", "claude-3.5-sonnet"

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  title!: string; // Nombre visible, ej: "GPT-4o", "Claude 3.5 Sonnet"

  @Index
  @Column({
    type: DataType.STRING(50),
    allowNull: false
  })
  engine!: AIProviderEngine; // Proveedor: openai, anthropic, google, etc.

  @Index
  @Column({
    type: DataType.STRING(30),
    allowNull: false
  })
  type!: AIEntityType; // Tipo: chat, embedding, image, etc.

  @Default(0)
  @Column(DataType.DECIMAL(10, 6))
  inputPrice!: number; // Precio por 1K tokens de entrada (USD)

  @Default(0)
  @Column(DataType.DECIMAL(10, 6))
  outputPrice!: number; // Precio por 1K tokens de salida (USD)

  @Default(4096)
  @Column(DataType.INTEGER)
  maxTokens!: number; // Limite maximo de tokens del modelo

  @Default([])
  @Column(DataType.JSONB)
  capabilities!: string[]; // Capacidades: ["vision", "function_calling", "streaming", "json_mode"]

  @Default('active')
  @Index
  @Column(DataType.STRING(20))
  status!: string; // active, deprecated, beta, disabled

  @Default(false)
  @Column(DataType.BOOLEAN)
  isSelected!: boolean; // Si esta seleccionado para uso en el sistema

  @Default({})
  @Column(DataType.JSONB)
  metadata!: Record<string, unknown>; // Datos adicionales: context_window, training_cutoff, etc.

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;
}

export default AIEntity;
