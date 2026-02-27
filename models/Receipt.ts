import {
    Table,
    Column,
    CreatedAt,
    UpdatedAt,
    Model,
    PrimaryKey,
    AutoIncrement,
    ForeignKey,
    Default,
    BelongsTo,
    DataType
  } from "sequelize-typescript";
  import Company from "./Company";
  import Invoices from "./Invoices";

  @Table
  class Receipt extends Model<Receipt> {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id: number;
  
    @ForeignKey(() => Company)
    @Column(DataType.INTEGER)
    companyId: number;
    @BelongsTo(() => Company)
    company: Company;

    @ForeignKey(() => Invoices)
    @Column(DataType.INTEGER)
    invoiceId: number;
 
    @Column({
      type: DataType.STRING,
      allowNull: true,
    })
    descripcion: string; // Descripción del comprobante
  
    @Column({
      type: DataType.INTEGER,
      allowNull: false,
      defaultValue: 1, // Estado inicial por defecto (ej. estado 1)
    })
    estado: number; // Representa el estado del comprobante

    @Column(DataType.STRING)
  get comprobante(): string | null {
    if (this.getDataValue("comprobante")) {
      
      return `${process.env.BACKEND_URL}${process.env.PROXY_PORT ?`:${process.env.PROXY_PORT}`:""}/public/company${this.companyId}/${this.getDataValue("comprobante")}`;

    }
    return null;
  }
    @CreatedAt
    createdAt: Date;
  
    @UpdatedAt
    updatedAt: Date;
  }
  
  export default Receipt;
  