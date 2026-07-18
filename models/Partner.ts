import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement
,
  DataType
} from "sequelize-typescript";

@Table({
  tableName: "Partners"
})
class Partner extends Model<Partner> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column(DataType.STRING)
  name: string;

  @Column(DataType.STRING)
  phone: string;

  @Column(DataType.STRING)
  email: string;

  @Column(DataType.STRING)
  document: string;

  @Column(DataType.INTEGER)
  commission: number;

  @Column(DataType.STRING)
  typeCommission: string;

  @Column(DataType.STRING)
  walletId: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Partner;
