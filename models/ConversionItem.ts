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
import AttributionConversion from "./AttributionConversion";
import Product from "./Product";

@Table({ tableName: "ConversionItems" })
class ConversionItem extends Model<ConversionItem> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => AttributionConversion)
  @Column(DataType.INTEGER)
  conversionId: number;

  @BelongsTo(() => AttributionConversion)
  conversion: AttributionConversion;

  @ForeignKey(() => Product)
  @Column(DataType.INTEGER)
  productId: number;

  @BelongsTo(() => Product)
  product: Product;

  @Column(DataType.STRING)
  productName: string;

  @Column(DataType.STRING(100))
  productSku: string;

  @Default(1)
  @Column(DataType.INTEGER)
  quantity: number;

  @Column(DataType.DECIMAL(10, 2))
  unitPrice: number;

  @Column(DataType.DECIMAL(10, 2))
  totalPrice: number;

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  discount: number;

  @Column(DataType.TEXT)
  notes: string;

  @CreatedAt
  @Column(DataType.DATE(6))
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE(6))
  updatedAt: Date;
}

export default ConversionItem;
