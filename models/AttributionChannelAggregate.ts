import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  Default,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import Company from "./Company";
import Campaign from "./Campaign";

@Table({ tableName: "AttributionChannelAggregates" })
class AttributionChannelAggregate extends Model<AttributionChannelAggregate> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Column(DataType.STRING)
  channel: string;

  @ForeignKey(() => Campaign)
  @Column(DataType.INTEGER)
  campaignId: number;

  @BelongsTo(() => Campaign)
  campaign: Campaign;

  @Column(DataType.DATEONLY)
  periodStart: Date;

  @Column(DataType.DATEONLY)
  periodEnd: Date;

  @Column(DataType.ENUM("first_touch", "last_touch", "linear", "time_decay", "position_based", "data_driven"))
  attributionModel: string;

  @Default(0)
  @Column(DataType.INTEGER)
  totalConversions: number;

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  totalRevenue: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  attributedConversions: number;

  @Default(0)
  @Column(DataType.DECIMAL(12, 2))
  attributedRevenue: number;

  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  avgTouchpointsPerJourney: number;

  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  multiTouchPercentage: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  avgConversionTimeHours: number;

  @Default(0)
  @Column(DataType.INTEGER)
  firstTouchCount: number;

  @Default(0)
  @Column(DataType.INTEGER)
  middleTouchCount: number;

  @Default(0)
  @Column(DataType.INTEGER)
  lastTouchCount: number;

  @Default(DataType.NOW)
  @Column(DataType.DATE)
  calculatedAt: Date;

  @CreatedAt
  @Column(DataType.DATE(6))
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE(6))
  updatedAt: Date;
}

export default AttributionChannelAggregate;
