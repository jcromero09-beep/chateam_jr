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
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";
import Company from "./Company";

@Table({ tableName: "AffiliateTiers" })
class AffiliateTier extends Model<AffiliateTier> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Column(DataType.STRING(50))
  name: string;

  @Column(DataType.INTEGER)
  level: number;

  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  commissionRate: number;

  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  level2Rate: number;

  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  level3Rate: number;

  @Default(0)
  @Column(DataType.INTEGER)
  minReferrals: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  minEarnings: number;

  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  bonusRate: number;

  @Default("active")
  @Column(DataType.STRING(20))
  status: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AffiliateTier;
