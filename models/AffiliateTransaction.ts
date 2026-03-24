import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  DataType,
  AllowNull,
  CreatedAt
} from "sequelize-typescript";
import AffiliateWallet from "./AffiliateWallet";
import Company from "./Company";

@Table({ tableName: "AffiliateTransactions", timestamps: false })
class AffiliateTransaction extends Model<AffiliateTransaction> {
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

  @Column(DataType.STRING(30))
  type: "commission" | "withdrawal" | "bonus" | "adjustment" | "refund" | "settlement";

  @Column(DataType.DECIMAL(12, 2))
  amount: number;

  @Column(DataType.DECIMAL(12, 2))
  balanceBefore: number;

  @Column(DataType.DECIMAL(12, 2))
  balanceAfter: number;

  @AllowNull(true)
  @Column(DataType.TEXT)
  description: string;

  @AllowNull(true)
  @Column(DataType.STRING(50))
  referenceType: string;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  referenceId: number;

  @AllowNull(true)
  @Column(DataType.JSONB)
  metadata: Record<string, unknown>;

  @CreatedAt
  createdAt: Date;
}

export default AffiliateTransaction;
