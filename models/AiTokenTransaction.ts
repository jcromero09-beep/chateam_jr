import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import Company from "./Company";
import AiTokenPlan from "./AiTokenPlan";
import User from "./User";

@Table({
  tableName: "AiTokenTransactions",
  timestamps: true
})
export default class AiTokenTransaction extends Model {
  @ForeignKey(() => Company)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    comment: "ID de la empresa"
  })
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => AiTokenPlan)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    comment: "ID del plan comprado"
  })
  planId: number;

  @BelongsTo(() => AiTokenPlan)
  plan: AiTokenPlan;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    comment: "Tipo: purchase, usage, refund, bonus, adjust"
  })
  type: "purchase" | "usage" | "refund" | "bonus" | "adjust";

  @Column({
    type: DataType.BIGINT,
    allowNull: false,
    comment: "Cantidad de tokens (positivo para crédito, negativo para débito)"
  })
  tokens: number;

  @Column({
    type: DataType.DECIMAL(18, 10),
    allowNull: true,
    comment: "Monto en USD de compras o consumos"
  })
  amountUsd: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: true,
    comment: "Módulo que consumió tokens"
  })
  module: string;

  @Column({
    type: DataType.STRING(120),
    allowNull: true,
    comment: "ID de referencia (ticketId, messageId, etc.)"
  })
  referenceId: string;

  @ForeignKey(() => User)
  @Column({
    type: DataType.INTEGER,
    allowNull: true,
    comment: "Usuario que realizó la acción"
  })
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @Column({
    type: DataType.STRING(120),
    allowNull: true,
    comment: "Stripe Checkout Session ID"
  })
  stripeSessionId: string;

  @Column({
    type: DataType.STRING(120),
    allowNull: true,
    comment: "Stripe Subscription ID"
  })
  stripeSubscriptionId: string;

  @Column({
    type: DataType.JSONB,
    allowNull: true,
    comment: "Metadata adicional"
  })
  meta: any;

  @Column({
    type: DataType.BIGINT,
    allowNull: true,
    comment: "Saldo después de la transacción"
  })
  balanceAfter: number;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    comment: "Descripción de la transacción"
  })
  description: string;

  @CreatedAt
  declare createdAt: Date;

  @UpdatedAt
  declare updatedAt: Date;
}
