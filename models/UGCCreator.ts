/**
 * Model: UGCCreator
 * Represents a human content creator in the creator network.
 * Manages profiles, rates, payment methods, and portfolio for UGC campaigns.
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
  HasMany,
  CreatedAt,
  UpdatedAt,
  Default,
  Index,
  AllowNull
} from "sequelize-typescript";
import Company from "./Company";
import UGCCreatorAssignment from "./UGCCreatorAssignment";

// Estados del creador en la plataforma
export type CreatorStatus = "pending" | "verified" | "active" | "suspended" | "archived";

// Metodos de pago soportados
export type CreatorPaymentMethod = "stripe" | "paypal" | "bank_transfer" | "crypto";

@Table({
  tableName: "UGCCreators",
  timestamps: true
})
class UGCCreator extends Model<UGCCreator> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_ugc_creators_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  name!: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  email!: string;

  @AllowNull(true)
  @Column(DataType.STRING(50))
  phone?: string;

  @AllowNull(true)
  @Column(DataType.STRING(1024))
  profileImageUrl?: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  bio?: string;

  @AllowNull(false)
  @Index("idx_ugc_creators_niche")
  @Column(DataType.STRING(255))
  niche!: string;

  @Default([])
  @AllowNull(true)
  @Column(DataType.JSONB)
  platforms!: string[];

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  followerCount!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(5, 2))
  engagementRate!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  averageViews!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  completedCampaigns!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(3, 2))
  rating!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(10, 2))
  baseRate!: number;

  @Default("USD")
  @AllowNull(false)
  @Column(DataType.STRING(10))
  currency!: string;

  @Default("stripe")
  @AllowNull(false)
  @Column(DataType.STRING(50))
  paymentMethod!: CreatorPaymentMethod;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  stripeAccountId?: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  paypalEmail?: string;

  @AllowNull(true)
  @Column(DataType.JSONB)
  bankDetails?: Record<string, unknown>;

  @Default([])
  @AllowNull(true)
  @Column(DataType.JSONB)
  portfolio!: Record<string, unknown>[];

  @Default([])
  @AllowNull(true)
  @Column(DataType.JSONB)
  tags!: string[];

  @Default("pending")
  @AllowNull(false)
  @Index("idx_ugc_creators_status")
  @Column(DataType.STRING(50))
  status!: CreatorStatus;

  @AllowNull(true)
  @Column(DataType.DATE)
  verifiedAt?: Date;

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

  // [Fix] El "lazy import" que prometia este comentario nunca existio => el alias
  // "assignments" no estaba registrado y GET /ugc/creators moria con 500
  // ("UGCCreatorAssignment is not associated to UGCCreator!"). El thunk de @HasMany
  // difiere la resolucion hasta addModels, asi que el import circular no molesta.
  @HasMany(() => UGCCreatorAssignment)
  assignments!: UGCCreatorAssignment[];

  // --- Metodos auxiliares ---

  isPending(): boolean {
    return this.status === "pending";
  }

  isActive(): boolean {
    return this.status === "active";
  }

  isVerified(): boolean {
    return this.status === "verified";
  }

  isSuspended(): boolean {
    return this.status === "suspended";
  }

  async verify(): Promise<void> {
    this.status = "verified";
    this.verifiedAt = new Date();
    await this.save();
  }

  async activate(): Promise<void> {
    this.status = "active";
    await this.save();
  }

  async suspend(): Promise<void> {
    this.status = "suspended";
    await this.save();
  }

  async archive(): Promise<void> {
    this.status = "archived";
    await this.save();
  }
}

export default UGCCreator;
