import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
  HasMany
} from "sequelize-typescript";
import AiTokenTransaction from "./AiTokenTransaction";

@Table({
  tableName: "AiTokenPlans",
  timestamps: true
})
export default class AiTokenPlan extends Model {
  @Column({
    type: DataType.STRING(40),
    allowNull: true,
    unique: true,
    comment: "Identificador único del plan"
  })
  code: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    comment: "Nombre del plan"
  })
  name: string;

  @Column({
    type: DataType.DECIMAL(10, 2),
    allowNull: false,
    comment: "Precio en USD"
  })
  priceUsd: number;

  @Column({
    type: DataType.BIGINT,
    allowNull: false,
    comment: "Cantidad de tokens incluidos"
  })
  tokens: number;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
    comment: "Si es plan recurrente por defecto"
  })
  isRecurring: boolean;

  @Column({
    type: DataType.STRING(120),
    allowNull: true,
    comment: "Stripe Price ID para compra única"
  })
  stripePriceIdOneTime: string;

  @Column({
    type: DataType.STRING(120),
    allowNull: true,
    comment: "Stripe Price ID para suscripción mensual"
  })
  stripePriceIdRecurring: string;

  @Column({
    type: DataType.STRING(120),
    allowNull: true,
    comment: "Stripe Product ID"
  })
  stripeProductId: string;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: true,
    comment: "Si el plan está activo para compra"
  })
  isActive: boolean;

  @Column({
    type: DataType.BOOLEAN,
    defaultValue: false,
    comment: "Si el plan está archivado"
  })
  isArchived: boolean;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    comment: "Descripción del plan"
  })
  description: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    comment: "Características adicionales del plan"
  })
  features: any;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => AiTokenTransaction)
  transactions: AiTokenTransaction[];
}