import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
  CreatedAt,
  UpdatedAt,
  Default,
  Index
} from "sequelize-typescript";
import Company from "./Company";
import AIChatbotDataSource from "./AIChatbotDataSource";

@Table({
  tableName: "AIChatbotConfigs",
  timestamps: true
})
class AIChatbotConfig extends Model<AIChatbotConfig> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @Index
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  companyId!: number;

  @Index
  @Column(DataType.INTEGER)
  queueId!: number; // Vinculado a cola específica

  @Column({
    type: DataType.STRING(255),
    allowNull: false
  })
  name!: string;

  @Column(DataType.TEXT)
  role!: string; // Rol del chatbot

  @Column(DataType.TEXT)
  firstMessage!: string; // Mensaje de bienvenida

  @Default('gpt-5.5')
  @Column(DataType.STRING(100))
  modelKey!: string;

  @Column(DataType.TEXT)
  instructions!: string; // System prompt custom

  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  interests!: string[]; // Temas permitidos

  @Default(0.7)
  @Column(DataType.DECIMAL(3, 2))
  temperature!: number;

  @Default(1024)
  @Column(DataType.INTEGER)
  maxTokens!: number;

  // UI Widget Customization
  @Default('#007bff')
  @Column(DataType.STRING(7))
  widgetColor!: string;

  @Default('bottom-right')
  @Column(DataType.STRING(20))
  widgetPosition!: string;

  @Column(DataType.TEXT)
  avatarUrl!: string;

  @Column(DataType.STRING(100))
  widgetTitle!: string;

  // Status
  @Default('draft')
  @Index
  @Column(DataType.STRING(20))
  status!: string; // 'draft' | 'training' | 'trained' | 'active'

  @Column(DataType.DATE)
  trainedAt!: Date;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  @BelongsTo(() => Company)
  company!: Company;

  @HasMany(() => AIChatbotDataSource)
  dataSources!: any[];
}

export default AIChatbotConfig;
