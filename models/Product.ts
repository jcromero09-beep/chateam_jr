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
  BelongsTo,
  HasMany
} from "sequelize-typescript";
import Company from "./Company";
import ConversionItem from "./ConversionItem";

@Table({ tableName: "Products" })
class Product extends Model<Product> {
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
  name: string;

  @Column(DataType.TEXT)
  description: string;

  @Column(DataType.STRING(100))
  sku: string;

  @Column(DataType.DECIMAL(10, 2))
  price: number;

  @Default("BRL")
  @Column(DataType.STRING(10))
  currency: string;

  @Column(DataType.DECIMAL(10, 2))
  costPrice: number;

  @Column(DataType.STRING(100))
  category: string;

  @Column(DataType.STRING(100))
  subcategory: string;

  @Column(DataType.JSON)
  tags: string[];

  @Column(DataType.JSON)
  detectionKeywords: string[];

  @Default(true)
  @Column(DataType.BOOLEAN)
  active: boolean;

  @Column(DataType.JSON)
  metadata: object;

  @CreatedAt
  @Column(DataType.DATE(6))
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE(6))
  updatedAt: Date;

  @HasMany(() => ConversionItem)
  conversionItems: ConversionItem[];
}

export default Product;
