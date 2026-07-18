import {
    Table,
    Column,
    CreatedAt,
    UpdatedAt,
    Model,
    PrimaryKey,
    AutoIncrement,
    DataType,
    Index
  } from "sequelize-typescript";

  @Table({ tableName: "CompanyTokenUsages" })
  class CompanyTokenUsage extends Model<CompanyTokenUsage> {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id!: number;

    @Index
    @Column(DataType.INTEGER)
    companyId!: number;

    @Index
    @Column(DataType.DATEONLY)
    date!: string;

    @Index
    @Column(DataType.STRING)
    model!: string;

    @Index
    @Column(DataType.DATE)
    month!: Date;

    @Column(DataType.BIGINT)
    tokensMonth!: number;

    @Column(DataType.BIGINT)
    tokensTotal!: number;

    @Column(DataType.DECIMAL(10, 5))
    costUsdMonth!: number;

    @Column(DataType.DECIMAL(12, 5))
    costUsdTotal!: number;

    @CreatedAt
    createdAt!: Date;

    @UpdatedAt
    updatedAt!: Date;
  }

  export default CompanyTokenUsage;
