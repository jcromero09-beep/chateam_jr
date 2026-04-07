import {
  Table, Column, Model, DataType, ForeignKey, BelongsTo,
  Default, AllowNull, PrimaryKey, AutoIncrement, CreatedAt, UpdatedAt
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";

@Table({ tableName: "AISupportCorrections", timestamps: true })
class AISupportCorrection extends Model<AISupportCorrection> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @AllowNull(false)
  @Column(DataType.TEXT)
  problem: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  solution: string;

  @Default("general")
  @Column(DataType.STRING(50))
  category: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive: boolean;

  @Default(0)
  @Column(DataType.INTEGER)
  usageCount: number;

  @Column(DataType.DATE)
  lastUsedAt: Date;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  createdBy: number;

  @BelongsTo(() => User)
  creator: User;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AISupportCorrection;
