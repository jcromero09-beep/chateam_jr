import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  HasMany,
  DataType,
  Default,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";
import Company from "./Company";
import AIAffiliateProgram from "./AIAffiliateProgram";
import AffiliateTransaction from "./AffiliateTransaction";
import AffiliateWithdrawal from "./AffiliateWithdrawal";

@Table({ tableName: "AffiliateWallets" })
class AffiliateWallet extends Model<AffiliateWallet> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => AIAffiliateProgram)
  @Column(DataType.INTEGER)
  affiliateId: number;

  @BelongsTo(() => AIAffiliateProgram)
  affiliate: AIAffiliateProgram;

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  availableBalance: number;

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  pendingBalance: number;

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  totalEarned: number;

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  totalWithdrawn: number;

  @Default("USD")
  @Column(DataType.STRING(3))
  currency: string;

  @Default("active")
  @Column(DataType.STRING(20))
  status: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => AffiliateTransaction)
  transactions: AffiliateTransaction[];

  @HasMany(() => AffiliateWithdrawal)
  withdrawals: AffiliateWithdrawal[];
}

export default AffiliateWallet;
