import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  HasOne,
  HasMany,
  DataType,
  Default,
  AllowNull,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";
import Company from "./Company";
import AffiliateTier from "./AffiliateTier";
import AffiliateWallet from "./AffiliateWallet";
import AffiliateLink from "./AffiliateLink";
import AIAffiliateReferral from "./AIAffiliateReferral";

@Table({ tableName: "AIAffiliatePrograms" })
class AIAffiliateProgram extends Model<AIAffiliateProgram> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Default('Programa de Afiliados')
  @Column(DataType.STRING(255))
  name: string;

  @Column(DataType.TEXT)
  description: string;

  @Column(DataType.STRING(50))
  referralCode: string;

  @Default(20.00)
  @Column(DataType.DECIMAL(5, 2))
  commissionRate: number;

  @Default(50.00)
  @Column(DataType.DECIMAL(10, 2))
  minimumWithdrawal: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  totalEarnings: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  pendingEarnings: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  withdrawnEarnings: number;

  @Default(0)
  @Column(DataType.INTEGER)
  referralsCount: number;

  @Default(0)
  @Column(DataType.INTEGER)
  activeReferrals: number;

  @Default("active")
  @Column(DataType.STRING(20))
  status: "active" | "inactive" | "pending_approval" | "suspended" | "rejected";

  // --- Columnas MLM nuevas ---

  @AllowNull(true)
  @ForeignKey(() => AIAffiliateProgram)
  @Column(DataType.INTEGER)
  parentAffiliateId: number;

  @AllowNull(true)
  @ForeignKey(() => AffiliateTier)
  @Column(DataType.INTEGER)
  tierId: number;

  @Default(1)
  @Column(DataType.INTEGER)
  level: number;

  @AllowNull(true)
  @Column(DataType.STRING(30))
  paymentMethod: string;

  @AllowNull(true)
  @Column(DataType.JSONB)
  paymentDetails: Record<string, unknown>;

  @Default("USD")
  @Column(DataType.STRING(3))
  currency: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  // --- Relaciones ---

  @BelongsTo(() => AIAffiliateProgram, { foreignKey: "parentAffiliateId", as: "parent" })
  parent: AIAffiliateProgram;

  @HasMany(() => AIAffiliateProgram, { foreignKey: "parentAffiliateId", as: "children" })
  children: AIAffiliateProgram[];

  @BelongsTo(() => AffiliateTier)
  tier: AffiliateTier;

  @HasOne(() => AffiliateWallet)
  wallet: AffiliateWallet;

  @HasMany(() => AffiliateLink)
  links: AffiliateLink[];

  @HasMany(() => AIAffiliateReferral)
  referrals: AIAffiliateReferral[];
}

export default AIAffiliateProgram;
