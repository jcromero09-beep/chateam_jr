import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  DataType,
  Default,
  AllowNull,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";
import AIAffiliateProgram from "./AIAffiliateProgram";
import Company from "./Company";
import AffiliateLink from "./AffiliateLink";

@Table({ tableName: "AIAffiliateReferrals", timestamps: true })
class AIAffiliateReferral extends Model<AIAffiliateReferral> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => AIAffiliateProgram)
  @Column(DataType.INTEGER)
  affiliateId: number;

  @AllowNull(true)
  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  affiliateCompanyId: number;

  @BelongsTo(() => Company, { foreignKey: "affiliateCompanyId", as: "affiliateCompany" })
  affiliateCompany: Company;

  @AllowNull(true)
  @ForeignKey(() => AffiliateLink)
  @Column(DataType.INTEGER)
  linkId: number;

  @BelongsTo(() => AffiliateLink, { foreignKey: "linkId", as: "link" })
  link: AffiliateLink;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  referredCompanyId: number;

  @BelongsTo(() => Company, { foreignKey: "referredCompanyId", as: "referredCompany" })
  referredCompany: Company;

  @AllowNull(true)
  @Column(DataType.STRING(80))
  referralSlug: string;

  @Column(DataType.INTEGER)
  subscriptionId: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  commissionAmount: number;

  // ── Recompensa entregada al afiliador ──────────────────────────────
  @AllowNull(true)
  @Column(DataType.STRING(20))
  rewardType: "tokens" | "days" | null;

  @Default(0)
  @Column(DataType.BIGINT)
  rewardTokens: number;

  @Default(0)
  @Column(DataType.INTEGER)
  rewardDays: number;

  @AllowNull(true)
  @Column(DataType.DATE)
  activatedAt: Date;

  @AllowNull(true)
  @Column(DataType.DATE)
  rewardProcessedAt: Date;

  @Default("registered")
  @Column(DataType.STRING(20))
  status: "registered" | "active" | "pending" | "paid" | "cancelled";

  @Default("pending")
  @Column(DataType.STRING(20))
  rewardStatus: "pending" | "claimable" | "claimed" | "cancelled";

  @AllowNull(true)
  @Column(DataType.DATE)
  rewardClaimedAt: Date;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  rewardClaimedBy: number;

  @Column(DataType.DATE)
  paidAt: Date;

  // --- Columnas MLM existentes ---

  @Default(1)
  @Column(DataType.INTEGER)
  level: number;

  @Default("signup")
  @Column(DataType.STRING(20))
  sourceType: "signup" | "renewal" | "upgrade";

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsTo(() => AIAffiliateProgram)
  affiliate: AIAffiliateProgram;
}

export default AIAffiliateReferral;
