/**
 * Modelo: AIVideoCreditTransaction
 * Gestiona las transacciones de créditos relacionadas con generación de videos
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
  import AIVideoGeneration from "./AIVideoGeneration";
  
  @Table({
    tableName: "AIVideoCreditTransactions",
    timestamps: true
  })
  class AIVideoCreditTransaction extends Model<AIVideoCreditTransaction> {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id!: number;
  
    @ForeignKey(() => Company)
    @AllowNull(false)
    @Index("idx_ai_video_credits_company")
    @Column(DataType.INTEGER)
    companyId!: number;
  
    @ForeignKey(() => User)
    @AllowNull(false)
    @Index("idx_ai_video_credits_user")
    @Column(DataType.INTEGER)
    userId!: number;
  
    @ForeignKey(() => AIVideoGeneration)
    @AllowNull(true)
    @Column(DataType.INTEGER)
    aiVideoGenerationId?: number;
  
    @AllowNull(false)
    @Index("idx_ai_video_credits_type")
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
    metadata?: Record<string, any>;
  
    @Default('completed')
    @AllowNull(false)
    @Index("idx_ai_video_credits_status")
    @Column(DataType.STRING(50))
    status!: string; // 'pending', 'completed', 'failed', 'refunded'
  
    @CreatedAt
    @Index("idx_ai_video_credits_created")
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
  
    @BelongsTo(() => AIVideoGeneration)
    videoGeneration?: AIVideoGeneration;
  
    // Métodos auxiliares
  
    isDebit(): boolean {
      return this.transactionType === 'debit';
    }
  
    isCredit(): boolean {
      return this.transactionType === 'credit';
    }
  
    isRefund(): boolean {
      return this.transactionType === 'refund';
    }
  
    isCompleted(): boolean {
      return this.status === 'completed';
    }
  
    getSignedAmount(): number {
      if (this.isDebit()) {
        return -this.creditsAmount;
      }
      return this.creditsAmount;
    }
  
    async markAsCompleted(): Promise<void> {
      this.status = 'completed';
      await this.save();
    }
  
    async markAsFailed(): Promise<void> {
      this.status = 'failed';
      await this.save();
    }
  
    async markAsRefunded(): Promise<void> {
      this.status = 'refunded';
      await this.save();
    }
  
    getFormattedCost(): string {
      if (!this.costUsd) return '$0.00';
      return `$${Number(this.costUsd).toFixed(2)}`;
    }
  
    generateDescription(videoSize?: string, duration?: number): string {
      switch (this.transactionType) {
        case 'debit':
          if (videoSize && duration) {
            return `Generación de video ${videoSize} de ${duration}s`;
          }
          return 'Débito por generación de video';
        case 'credit':
          return 'Recarga de créditos';
        case 'refund':
          return 'Reembolso de créditos por video';
        default:
          return 'Transacción de créditos';
      }
    }
  }
  
  export default AIVideoCreditTransaction;
  