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
import AffiliateWallet from "./AffiliateWallet";
import Company from "./Company";
import AIAffiliateProgram from "./AIAffiliateProgram";
import User from "./User";

@Table({ tableName: "AffiliateWithdrawals" })
class AffiliateWithdrawal extends Model<AffiliateWithdrawal> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => AffiliateWallet)
  @Column(DataType.INTEGER)
  walletId: number;

  @BelongsTo(() => AffiliateWallet)
  wallet: AffiliateWallet;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @ForeignKey(() => AIAffiliateProgram)
  @Column(DataType.INTEGER)
  affiliateId: number;

  @BelongsTo(() => AIAffiliateProgram)
  affiliate: AIAffiliateProgram;

  @Column(DataType.DECIMAL(12, 2))
  amount: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  fee: number;

  @Column(DataType.DECIMAL(12, 2))
  netAmount: number;

  @Column(DataType.STRING(30))
  paymentMethod: string;

  @AllowNull(true)
  @Column(DataType.JSONB)
  paymentDetails: Record<string, unknown>;

  @Default("requested")
  @Column(DataType.STRING(20))
  status: "requested" | "approved" | "processing" | "completed" | "rejected" | "failed";

  @Column(DataType.DATE)
  requestedAt: Date;

  @AllowNull(true)
  @Column(DataType.DATE)
  processedAt: Date;

  @AllowNull(true)
  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  processedBy: number;

  @BelongsTo(() => User, { foreignKey: "processedBy", as: "processor" })
  processor: User;

  @AllowNull(true)
  @Column(DataType.TEXT)
  rejectionReason: string;

  @AllowNull(true)
  @Column(DataType.STRING(100))
  transactionRef: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AffiliateWithdrawal;
