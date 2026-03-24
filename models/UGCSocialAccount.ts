/**
 * Model: UGCSocialAccount
 * Represents a connected social media account used for publishing
 * UGC content. Stores encrypted OAuth tokens and engagement metrics.
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

// Estados de la cuenta social conectada
export type SocialAccountStatus = "active" | "expired" | "revoked" | "suspended";

// Plataformas soportadas
export type SocialAccountPlatform = "instagram" | "tiktok" | "facebook" | "youtube";

@Table({
  tableName: "UGCSocialAccounts",
  timestamps: true
})
class UGCSocialAccount extends Model<UGCSocialAccount> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_ugc_social_accounts_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @AllowNull(false)
  @Index("idx_ugc_social_accounts_platform")
  @Column(DataType.STRING(50))
  platform!: SocialAccountPlatform;

  @AllowNull(false)
  @Index("idx_ugc_social_accounts_platform_id")
  @Column(DataType.STRING(255))
  platformAccountId!: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  username!: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  displayName?: string;

  @AllowNull(true)
  @Column(DataType.STRING(1024))
  profileImageUrl?: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  accessToken!: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  refreshToken?: string;

  @AllowNull(true)
  @Column(DataType.DATE)
  tokenExpiresAt?: Date;

  @Default([])
  @AllowNull(true)
  @Column(DataType.JSONB)
  scopes!: string[];

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  followerCount!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  followingCount!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  postCount!: number;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.DECIMAL(5, 2))
  engagementRate!: number;

  @AllowNull(true)
  @Column(DataType.DATE)
  lastSyncAt?: Date;

  @Default("active")
  @AllowNull(false)
  @Index("idx_ugc_social_accounts_status")
  @Column(DataType.STRING(50))
  status!: SocialAccountStatus;

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

  // HasMany UGCSocialPost se registra via lazy import para evitar circular
  // La relacion se declara en el init del modelo

  // --- Metodos auxiliares ---

  isActive(): boolean {
    return this.status === "active";
  }

  isTokenExpired(): boolean {
    if (!this.tokenExpiresAt) return false;
    return new Date() > new Date(this.tokenExpiresAt);
  }

  needsRefresh(): boolean {
    if (!this.tokenExpiresAt) return false;
    const threshold = new Date();
    threshold.setMinutes(threshold.getMinutes() + 30);
    return threshold > new Date(this.tokenExpiresAt);
  }

  async markAsExpired(): Promise<void> {
    this.status = "expired";
    await this.save();
  }

  async markAsRevoked(): Promise<void> {
    this.status = "revoked";
    await this.save();
  }

  async updateMetrics(metrics: {
    followerCount?: number;
    followingCount?: number;
    postCount?: number;
    engagementRate?: number;
  }): Promise<void> {
    if (metrics.followerCount !== undefined) this.followerCount = metrics.followerCount;
    if (metrics.followingCount !== undefined) this.followingCount = metrics.followingCount;
    if (metrics.postCount !== undefined) this.postCount = metrics.postCount;
    if (metrics.engagementRate !== undefined) this.engagementRate = metrics.engagementRate;
    this.lastSyncAt = new Date();
    await this.save();
  }
}

export default UGCSocialAccount;
