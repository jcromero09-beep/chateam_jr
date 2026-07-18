/**
 * Model: UGCCreatorPayment
 * Represents payments to creators via Stripe Connect, PayPal, or bank transfer.
 * Tracks platform fees, net amounts, and payment lifecycle.
 */

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
  AllowNull
} from "sequelize-typescript";
import Company from "./Company";
import UGCCreator from "./UGCCreator";
import UGCCreatorAssignment from "./UGCCreatorAssignment";

// Estados del ciclo de vida de un pago
export type PaymentStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "refunded"
  | "cancelled";

// Metodos de pago soportados
export type PaymentMethod = "stripe" | "paypal" | "bank_transfer" | "crypto";

@Table({
  tableName: "UGCCreatorPayments",
  timestamps: true
})
class UGCCreatorPayment extends Model<UGCCreatorPayment> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_ugc_creator_payments_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @ForeignKey(() => UGCCreator)
  @AllowNull(false)
  @Index("idx_ugc_creator_payments_creator")
  @Column(DataType.INTEGER)
  creatorId!: number;

  @ForeignKey(() => UGCCreatorAssignment)
  @AllowNull(true)
  @Index("idx_ugc_creator_payments_assignment")
  @Column(DataType.INTEGER)
  assignmentId?: number;

  @AllowNull(false)
  @Column(DataType.DECIMAL(10, 2))
  amount!: number;

  @Default("USD")
  @AllowNull(false)
  @Column(DataType.STRING(10))
  currency!: string;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(10, 2))
  platformFee!: number;

  @AllowNull(false)
  @Column(DataType.DECIMAL(10, 2))
  netAmount!: number;

  @AllowNull(false)
  @Column(DataType.STRING(50))
  paymentMethod!: PaymentMethod;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  stripeTransferId?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  stripePayoutId?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  paypalPayoutId?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  transactionReference?: string;

  @AllowNull(true)
  @Column(DataType.STRING(1024))
  invoiceUrl?: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  description?: string;

  @Default("pending")
  @AllowNull(false)
  @Index("idx_ugc_creator_payments_status")
  @Column(DataType.STRING(50))
  status!: PaymentStatus;

  @AllowNull(true)
  @Column(DataType.DATE)
  paidAt?: Date;

  @AllowNull(true)
  @Column(DataType.TEXT)
  failureReason?: string;

  @Default({})
  @AllowNull(true)
  @Column(DataType.JSONB)
  metadata!: Record<string, unknown>;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt!: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt!: Date;

  // --- Relaciones ---

  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => UGCCreator)
  creator!: UGCCreator;

  @BelongsTo(() => UGCCreatorAssignment, "assignmentId")
  assignment?: UGCCreatorAssignment;

  // --- Metodos auxiliares ---

  isPending(): boolean {
    return this.status === "pending";
  }

  isCompleted(): boolean {
    return this.status === "completed";
  }

  isFailed(): boolean {
    return this.status === "failed";
  }

  async markProcessing(): Promise<void> {
    this.status = "processing";
    await this.save();
  }

  async markCompleted(transactionReference?: string): Promise<void> {
    this.status = "completed";
    this.paidAt = new Date();
    if (transactionReference) {
      this.transactionReference = transactionReference;
    }
    await this.save();
  }

  async markFailed(reason: string): Promise<void> {
    this.status = "failed";
    this.failureReason = reason;
    await this.save();
  }

  async refund(): Promise<void> {
    this.status = "refunded";
    await this.save();
  }

  async cancel(): Promise<void> {
    this.status = "cancelled";
    await this.save();
  }
}

export default UGCCreatorPayment;
