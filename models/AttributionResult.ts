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
import AttributionConversion from "./AttributionConversion";
import AttributionTouchpoint from "./AttributionTouchpoint";

@Table({ tableName: "AttributionResults" })
class AttributionResult extends Model<AttributionResult> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => AttributionConversion)
  @Column(DataType.INTEGER)
  conversionId: number;

  @BelongsTo(() => AttributionConversion)
  conversion: AttributionConversion;

  @ForeignKey(() => AttributionTouchpoint)
  @Column(DataType.INTEGER)
  touchpointId: number;

  @BelongsTo(() => AttributionTouchpoint)
  touchpoint: AttributionTouchpoint;

  @Column(DataType.ENUM("first_touch", "last_touch", "linear", "time_decay", "position_based", "data_driven"))
  attributionModel: string;

  @Column(DataType.DECIMAL(5, 4))
  attributionWeight: number;

  @Column(DataType.DECIMAL(10, 2))
  attributedRevenue: number;

  @Column(DataType.JSON)
  modelParameters: object;

  @Column(DataType.DATEONLY)
  periodStart: Date;

  @Column(DataType.DATEONLY)
  periodEnd: Date;

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

export default AttributionResult;
