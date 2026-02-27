/**
 * Modelo: AIImageCreditTransaction
 * Gestiona las transacciones de créditos relacionadas con generación de imágenes
 * Migrado desde Laravel AiGen (CreditWalletTransaction con credit_type=3)
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
  Index,
  Default,
  AllowNull
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";
import AIImageGeneration from "./AIImageGeneration";

@Table({
  tableName: "AIImageCreditTransactions",
  timestamps: true
})
class AIImageCreditTransaction extends Model<AIImageCreditTransaction> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_ai_image_credits_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Index("idx_ai_image_credits_user")
  @Column(DataType.INTEGER)
  userId!: number;

  @ForeignKey(() => AIImageGeneration)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  aiImageGenerationId?: number;

  @AllowNull(false)
  @Index("idx_ai_image_credits_type")
  @Column(DataType.STRING(50))
  transactionType!: string; // 'debit', 'credit', 'refund'

  @AllowNull(false)
  @Column(DataType.INTEGER)
  creditsAmount!: number; // Siempre positivo, el tipo indica si suma o resta

  @AllowNull(true)
  @Column(DataType.DECIMAL(10, 5))
  costUsd?: number;

  @AllowNull(true)
  @Column(DataType.STRING(100))
  description?: string;

  @AllowNull(true)
  @Column(DataType.JSONB)
  metadata?: Record<string, any>; // Información adicional de la transacción

  @Default('completed')
  @AllowNull(false)
  @Index("idx_ai_image_credits_status")
  @Column(DataType.STRING(50))
  status!: string; // 'pending', 'completed', 'failed', 'refunded'

  @CreatedAt
  @Index("idx_ai_image_credits_created")
  @Column(DataType.DATE)
  createdAt!: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt!: Date;

  // Relaciones
  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => User)
  user!: User;

  @BelongsTo(() => AIImageGeneration)
  imageGeneration?: AIImageGeneration;

  // Métodos auxiliares

  /**
   * Verifica si la transacción es un débito (resta créditos)
   */
  isDebit(): boolean {
    return this.transactionType === 'debit';
  }

  /**
   * Verifica si la transacción es un crédito (suma créditos)
   */
  isCredit(): boolean {
    return this.transactionType === 'credit';
  }

  /**
   * Verifica si la transacción es un reembolso
   */
  isRefund(): boolean {
    return this.transactionType === 'refund';
  }

  /**
   * Verifica si la transacción está completada
   */
  isCompleted(): boolean {
    return this.status === 'completed';
  }

  /**
   * Obtiene el monto con signo según el tipo de transacción
   * @returns Monto positivo para créditos/reembolsos, negativo para débitos
   */
  getSignedAmount(): number {
    if (this.isDebit()) {
      return -this.creditsAmount;
    }
    return this.creditsAmount;
  }

  /**
   * Marca la transacción como completada
   */
  async markAsCompleted(): Promise<void> {
    this.status = 'completed';
    await this.save();
  }

  /**
   * Marca la transacción como fallida
   */
  async markAsFailed(): Promise<void> {
    this.status = 'failed';
    await this.save();
  }

  /**
   * Marca la transacción como reembolsada
   */
  async markAsRefunded(): Promise<void> {
    this.status = 'refunded';
    await this.save();
  }

  /**
   * Obtiene el costo formateado en USD
   */
  getFormattedCost(): string {
    if (!this.costUsd) return '$0.00';
    return `$${Number(this.costUsd).toFixed(2)}`;
  }

  /**
   * Crea una descripción automática basada en el tipo de transacción
   */
  generateDescription(imageSize?: string, numberOfImages?: number): string {
    switch (this.transactionType) {
      case 'debit':
        if (imageSize && numberOfImages) {
          return `Generación de ${numberOfImages} imagen(es) de ${imageSize}`;
        }
        return 'Débito por generación de imágenes';
      case 'credit':
        return 'Recarga de créditos';
      case 'refund':
        return 'Reembolso de créditos';
      default:
        return 'Transacción de créditos';
    }
  }
}

export default AIImageCreditTransaction;
