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
  Unique,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";
import AIAffiliateProgram from "./AIAffiliateProgram";
import Company from "./Company";

@Table({ tableName: "AffiliateLinks" })
class AffiliateLink extends Model<AffiliateLink> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => AIAffiliateProgram)
  @Column(DataType.INTEGER)
  affiliateId: number;

  @BelongsTo(() => AIAffiliateProgram)
  affiliate: AIAffiliateProgram;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Unique
  @Column(DataType.STRING(50))
  slug: string;

  @Column(DataType.TEXT)
  targetUrl: string;

  @AllowNull(true)
  @Column(DataType.STRING(50))
  source: string;

  @AllowNull(true)
  @Column(DataType.STRING(50))
  medium: string;

  @Default(0)
  @Column(DataType.INTEGER)
  clicks: number;

  @Default(0)
  @Column(DataType.INTEGER)
  conversions: number;

  @Default("active")
  @Column(DataType.STRING(20))
  status: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AffiliateLink;
