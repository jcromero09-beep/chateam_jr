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
// COMENTADO: Subplanes ya no están ligados a un proveedor específico
// import AIProviderConfig from "./AIProviderConfig";

@Table({
  tableName: "AISubplans",
  timestamps: true
})
class AISubplan extends Model<AISubplan> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @Index
  @Column(DataType.INTEGER)
  companyId!: number;

  // COMENTADO: Subplanes ya no están ligados a un proveedor específico
  // El proveedor se selecciona al momento de usar IA (en Prompts)
  // @ForeignKey(() => AIProviderConfig)
  // @Index
  // @Column(DataType.INTEGER)
  // aiProviderConfigId!: number;

  @Column({
    type: DataType.STRING(100),
    allowNull: false
  })
  name!: string;

  @Column(DataType.TEXT)
  description!: string;

  @Column({
    type: DataType.BIGINT,
    allowNull: false,
    defaultValue: 0
  })
  tokens!: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  priceUsd!: number;

  // Tokens consumidos del subplan (tracking de uso)
  @Default(0)
  @Column(DataType.BIGINT)
  tokensConsumed!: number;

  // Límite de agentes IA para este subplan
  @Default(1)
  @Column(DataType.INTEGER)
  maxAgents!: number;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive!: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isPublic!: boolean;

  // Integración Stripe (opcional)
  @Column(DataType.STRING(255))
  stripeProductId!: string;

  @Column(DataType.STRING(255))
  stripePriceId!: string;

  // Integración PayPal (opcional)
  @Column(DataType.STRING(255))
  paypalProductId!: string;

  @Column(DataType.STRING(255))
  paypalPriceId!: string;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  // Relaciones
  @BelongsTo(() => Company)
  company!: Company;

  // COMENTADO: Subplanes ya no están ligados a un proveedor específico
  // @BelongsTo(() => AIProviderConfig)
  // aiProviderConfig!: AIProviderConfig;
}

export default AISubplan;
