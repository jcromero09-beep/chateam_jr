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
  import AISubplan from "./AISubplan";

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

    @Column({
      type: DataType.STRING(30),
      allowNull: false,
      defaultValue: "subscription",
    })
    purchaseType: "subscription" | "ai_subplan";

    @Column({
      type: DataType.INTEGER,
      allowNull: true,
    })
    planId: number;

    @Column({
      type: DataType.STRING,
      allowNull: true,
    })
    planName: string;

    @Column({
      type: DataType.DECIMAL(10, 2),
      allowNull: true,
    })
    totalPrice: number;

    @Column({
      type: DataType.STRING,
      allowNull: true,
    })
    duration: string;

    @ForeignKey(() => AISubplan)
    @Column({
      type: DataType.INTEGER,
      allowNull: true,
    })
    aiSubplanId: number;

    @BelongsTo(() => AISubplan)
    aiSubplan: AISubplan;

    @Column({
      type: DataType.BIGINT,
      allowNull: true,
    })
    aiTokens: number;

    @Column({
      type: DataType.DECIMAL(10, 2),
      allowNull: true,
    })
    amountUsd: number;

    @Column({
      type: DataType.INTEGER,
      allowNull: true,
    })
    processedBy: number;

    @Column({
      type: DataType.DATE,
      allowNull: true,
    })
    processedAt: Date;

    @Column({
      type: DataType.TEXT,
      allowNull: true,
    })
    rejectionReason: string;

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
  
