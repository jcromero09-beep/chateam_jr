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
import User from "./User";

// Tipos para condiciones y acciones dinámicas
export interface RuleCondition {
  metric: string;       // spend, cost_per_conversion, ctr, cpc, cpm, roas, frequency, impressions, conversions, reach
  operator: string;     // >, <, >=, <=, =, !=, between, increased_by, decreased_by
  value: number;        // Valor umbral
  value2?: number;      // Segundo valor (para operador 'between')
  timeRange: string;    // last_1_day, last_3_days, last_7_days, last_14_days, last_30_days
  logic?: "AND" | "OR"; // Relación con la siguiente condición
}

export interface RuleAction {
  type: string;         // pause, activate, adjust_budget, notify_whatsapp
  params?: {
    direction?: "increase" | "decrease";
    amount?: number;
    unit?: "percent" | "absolute";
    message?: string;
  };
}

@Table({
  tableName: "CampaignRules",
  timestamps: true
})
class CampaignRule extends Model<CampaignRule> {
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

  @Column({
    type: DataType.STRING(255),
    allowNull: false
  })
  name!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true
  })
  description!: string;

  @Default("campaign")
  @Column({
    type: DataType.ENUM("account", "campaign", "adset", "ad"),
    allowNull: false
  })
  scope!: "account" | "campaign" | "adset" | "ad";

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    comment: "Array de Meta IDs a evaluar, null = todas las activas"
  })
  scopeIds!: string[] | null;

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    comment: "Array de condiciones: [{metric, operator, value, timeRange, logic}]"
  })
  conditions!: RuleCondition[];

  @Column({
    type: DataType.JSONB,
    allowNull: false,
    comment: "Array de acciones: [{type, params}]"
  })
  actions!: RuleAction[];

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    comment: "Lista de números WhatsApp para notificaciones"
  })
  notificationPhones!: string[] | null;

  @Default("hourly")
  @Column({
    type: DataType.ENUM("every_15min", "every_30min", "hourly", "every_6h", "daily"),
    allowNull: false
  })
  frequency!: "every_15min" | "every_30min" | "hourly" | "every_6h" | "daily";

  @Default(60)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    comment: "Minutos de espera entre triggers para evitar repeticiones"
  })
  cooldownMinutes!: number;

  @Default("active")
  @Index
  @Column({
    type: DataType.ENUM("active", "paused", "error"),
    allowNull: false
  })
  status!: "active" | "paused" | "error";

  @Column({
    type: DataType.DATE,
    allowNull: true
  })
  lastExecutedAt!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true
  })
  lastTriggeredAt!: Date;

  @Default(0)
  @Column(DataType.INTEGER)
  executionCount!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  triggerCount!: number;

  @Default(0)
  @Column({
    type: DataType.INTEGER,
    comment: "Errores consecutivos, si >= 3 se pausa automáticamente"
  })
  consecutiveErrors!: number;

  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,
    allowNull: true
  })
  createdBy!: number;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  // Relaciones
  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => User, "createdBy")
  creator!: User;
}

export default CampaignRule;
