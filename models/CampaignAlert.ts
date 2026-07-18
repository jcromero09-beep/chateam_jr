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

@Table({
  tableName: "CampaignAlerts",
  timestamps: true
})
class CampaignAlert extends Model<CampaignAlert> {
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
  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    comment: "ID de campaña en Facebook, STRING para evitar perdida de precision"
  })
  campaignId!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false
  })
  campaignName!: string;

  @Index
  @Column({
    type: DataType.ENUM(
      "cpa_high",
      "ctr_low",
      "budget_depleted",
      "frequency_high",
      "no_conversions",
      "spend_anomaly",
      "no_impressions",
      "performance_drop",
      "custom"
    ),
    allowNull: false
  })
  alertType!:
    | "cpa_high"
    | "ctr_low"
    | "budget_depleted"
    | "frequency_high"
    | "no_conversions"
    | "spend_anomaly"
    | "no_impressions"
    | "performance_drop"
    | "custom";

  @Column({
    type: DataType.ENUM("critical", "warning", "info"),
    allowNull: false,
    defaultValue: "warning"
  })
  severity!: "critical" | "warning" | "info";

  @Column({
    type: DataType.STRING(255),
    allowNull: false
  })
  title!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false
  })
  message!: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
    comment: "Metrica evaluada: ctr, cpa, spend, frequency, etc."
  })
  metric!: string;

  @Column({
    type: DataType.FLOAT,
    allowNull: true,
    comment: "Valor actual de la metrica al momento del trigger"
  })
  currentValue!: number;

  @Column({
    type: DataType.FLOAT,
    allowNull: true,
    comment: "Umbral configurado para la alerta"
  })
  thresholdValue!: number;

  @Default("active")
  @Index
  @Column({
    type: DataType.ENUM("active", "acknowledged", "resolved"),
    allowNull: false
  })
  status!: "active" | "acknowledged" | "resolved";

  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,
    allowNull: true
  })
  acknowledgedBy!: number;

  @Column({
    type: DataType.DATE,
    allowNull: true
  })
  acknowledgedAt!: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true
  })
  resolvedAt!: Date;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    comment: "Datos adicionales: metricas snapshot, sugerencia de accion, etc."
  })
  metadata!: any;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  // Relaciones
  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => User, "acknowledgedBy")
  acknowledgedByUser!: User;
}

export default CampaignAlert;
