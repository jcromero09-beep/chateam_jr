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
  Index,
  AfterSave
} from "sequelize-typescript";
import { Op } from "sequelize";
import Company from "./Company";

// Tipos de proveedores de IA soportados
export type AIProviderType = 'openai' | 'anthropic' | 'google' | 'azure' | 'cohere' | 'mistral' | 'deepseek';

// Configuracion especifica por proveedor
export interface AIProviderSettings {
  // OpenAI
  organization?: string;
  defaultModel?: string;
  maxTokens?: number;
  temperature?: number;
  // Azure
  endpoint?: string;
  deploymentName?: string;
  apiVersion?: string;
  // Google
  projectId?: string;
  location?: string;
  // General
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  customHeaders?: Record<string, string>;
}

@Table({
  tableName: "AIProviderConfigs",
  timestamps: true
})
class AIProviderConfig extends Model<AIProviderConfig> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @Index
  @Column({ type: DataType.INTEGER, allowNull: true })  // allowNull: true para proveedores globales (superadmin)
  companyId!: number | null;

  @Index
  @Column({
    type: DataType.STRING(50),
    allowNull: false
  })
  provider!: AIProviderType;

  @Column({
    type: DataType.STRING(100),
    allowNull: false
  })
  name!: string; // Nombre descriptivo de la configuracion

  @Column({
    type: DataType.TEXT,
    allowNull: false
  })
  apiKey!: string; // Clave API (deberia estar encriptada)

  @Column(DataType.TEXT)
  apiSecret!: string; // Secreto adicional si es necesario

  @Column(DataType.STRING(255))
  baseUrl!: string; // URL base personalizada (para proxies o Azure)

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isDefault!: boolean; // Si es el proveedor por defecto

  @Default({})
  @Column(DataType.JSONB)
  settings!: AIProviderSettings;

  // Limites de uso
  @Default(100000)
  @Column(DataType.INTEGER)
  dailyTokenLimit!: number;

  @Default(10000)
  @Column(DataType.INTEGER)
  hourlyTokenLimit!: number;

  @Default(1000)
  @Column(DataType.INTEGER)
  requestsPerMinute!: number;

  // Tracking de uso
  @Default(0)
  @Column(DataType.BIGINT)
  totalTokensUsed!: number;

  @Default(0)
  @Column(DataType.BIGINT)
  totalRequests!: number;

  @Default(0)
  @Column(DataType.DECIMAL(12, 5))
  totalCost!: number;

  // Estado de conexion
  @Default('pending')
  @Column(DataType.STRING(50))
  connectionStatus!: string; // pending, connected, error, disabled

  @Column(DataType.DATE)
  lastTestedAt!: Date;

  @Column(DataType.TEXT)
  lastError!: string;

  // Modelos disponibles para este proveedor
  @Default([])
  @Column(DataType.JSONB)
  availableModels!: string[];

  // Capacidades de IA habilitadas
  @Default(true)
  @Column(DataType.BOOLEAN)
  textGenerationEnabled!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  translationEnabled!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  imageGenerationEnabled!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  imageAnalysisEnabled!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  speechToTextEnabled!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  textToSpeechEnabled!: boolean;

  // Proveedor por defecto para cada capacidad (solo uno puede ser true por capacidad)
  @Default(false)
  @Column(DataType.BOOLEAN)
  isDefaultForText!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isDefaultForTranslation!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isDefaultForImages!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isDefaultForImageAnalysis!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isDefaultForSTT!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isDefaultForTTS!: boolean;

  // Precios por capacidad (creditos)
  @Default(2)
  @Column(DataType.DECIMAL(10, 4))
  textGenerationPricing!: number;

  @Default(3)
  @Column(DataType.DECIMAL(10, 4))
  translationPricing!: number;

  @Default({ "1024x1024": 30, "512x512": 20, "256x256": 10 })
  @Column(DataType.JSONB)
  imageGenerationPricing!: Record<string, number>;

  @Default(15)
  @Column(DataType.DECIMAL(10, 4))
  imageAnalysisPricing!: number;

  @Default(10)
  @Column(DataType.DECIMAL(10, 4))
  speechToTextPricing!: number;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  @BelongsTo(() => Company)
  company!: Company;

  // Hook para asegurar solo un default por capacidad
  @AfterSave
  static async ensureSingleDefaultPerCapability(instance: AIProviderConfig) {
    const defaultFields = [
      { field: 'isDefaultForText', enabled: 'textGenerationEnabled' },
      { field: 'isDefaultForTranslation', enabled: 'translationEnabled' },
      { field: 'isDefaultForImages', enabled: 'imageGenerationEnabled' },
      { field: 'isDefaultForImageAnalysis', enabled: 'imageAnalysisEnabled' },
      { field: 'isDefaultForSTT', enabled: 'speechToTextEnabled' },
      { field: 'isDefaultForTTS', enabled: 'textToSpeechEnabled' }
    ];

    for (const { field, enabled } of defaultFields) {
      const isDefault = (instance as any)[field];
      const isEnabled = (instance as any)[enabled];

      // Si se marco como default, quitar default de otros proveedores
      if (isDefault && isEnabled) {
        await AIProviderConfig.update(
          { [field]: false },
          {
            where: {
              companyId: instance.companyId,
              id: { [Op.ne]: instance.id }
            }
          }
        );
      }

      // Si la capacidad esta deshabilitada, quitar el default automaticamente
      if (!isEnabled && isDefault) {
        await instance.update({ [field]: false });
      }
    }
  }
}

export default AIProviderConfig;
