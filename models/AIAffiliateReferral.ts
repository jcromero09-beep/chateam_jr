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
  CreatedAt
} from "sequelize-typescript";
import AIAffiliateProgram from "./AIAffiliateProgram";

@Table({ tableName: "AIAffiliateReferrals", timestamps: false })
class AIAffiliateReferral extends Model<AIAffiliateReferral> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => AIAffiliateProgram)
  @Column(DataType.INTEGER)
  affiliateId: number;

  @Column(DataType.INTEGER)
  referredCompanyId: number;

  @Column(DataType.INTEGER)
  subscriptionId: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  commissionAmount: number;

  @Default("pending")
  @Column(DataType.STRING(20))
  status: "pending" | "paid" | "cancelled";

  @Column(DataType.DATE)
  paidAt: Date;

  // --- Columnas MLM nuevas ---

  @Default(1)
  @Column(DataType.INTEGER)
  level: number;

  @Default("signup")
  @Column(DataType.STRING(20))
  sourceType: "signup" | "renewal" | "upgrade";

  @CreatedAt
  createdAt: Date;

  @BelongsTo(() => AIAffiliateProgram)
  affiliate: AIAffiliateProgram;
}

export default AIAffiliateReferral;
