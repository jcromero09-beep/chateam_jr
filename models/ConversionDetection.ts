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
import Ticket from "./Ticket";
import Contact from "./Contact";
import Message from "./Message";
import User from "./User";

@Table({ tableName: "ConversionDetections" })
class ConversionDetection extends Model<ConversionDetection> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => Ticket)
  @Column(DataType.INTEGER)
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @ForeignKey(() => Contact)
  @Column(DataType.INTEGER)
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @ForeignKey(() => Message)
  @Column(DataType.INTEGER)
  messageId: number;

  @BelongsTo(() => Message)
  message: Message;

  @Column(DataType.DECIMAL(3, 2))
  detectionConfidence: number;

  @Column(DataType.DECIMAL(10, 2))
  detectedAmount: number;

  @Default("BRL")
  @Column(DataType.STRING(10))
  detectedCurrency: string;

  @Column(DataType.JSON)
  detectedProducts: string[];

  @Column(DataType.JSON)
  saleKeywords: string[];

  @Default("pending")
  @Column(DataType.ENUM("pending", "confirmed", "rejected", "converted_to_sale", "auto_confirmed"))
  status: string;

  @Column(DataType.JSON)
  aiAnalysis: object;

  @Column(DataType.TEXT)
  messageContext: string;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  reviewedBy: number;

  @BelongsTo(() => User)
  reviewer: User;

  @Column(DataType.DATE)
  reviewedAt: Date;

  @Column(DataType.TEXT)
  reviewNotes: string;

  @Default(DataType.NOW)
  @Column(DataType.DATE)
  detectedAt: Date;

  @CreatedAt
  @Column(DataType.DATE(6))
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE(6))
  updatedAt: Date;
}

export default ConversionDetection;
