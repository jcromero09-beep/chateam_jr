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
import Ticket from "./Ticket";
import Contact from "./Contact";
import User from "./User";
import ConversionDetection from "./ConversionDetection";
import ConversionItem from "./ConversionItem";
import AttributionResult from "./AttributionResult";

@Table({ tableName: "AttributionConversions" })
class AttributionConversion extends Model<AttributionConversion> {
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

  @Column(DataType.DECIMAL(10, 2))
  totalRevenue: number;

  @Default("BRL")
  @Column(DataType.STRING(10))
  currency: string;

  @Column(DataType.STRING(100))
  orderId: string;

  @Column(DataType.DATE)
  orderDate: Date;

  @Column(DataType.STRING)
  journeyId: string;

  @Column(DataType.DATE)
  conversionTimestamp: Date;

  @Column(DataType.DATE)
  firstTouchTimestamp: Date;

  @Column(DataType.DATE)
  lastTouchTimestamp: Date;

  @Column(DataType.DECIMAL(10, 2))
  conversionDurationHours: number;

  @Column(DataType.STRING(50))
  conversionSource: string;

  @ForeignKey(() => ConversionDetection)
  @Column(DataType.INTEGER)
  detectionId: number;

  @BelongsTo(() => ConversionDetection)
  detection: ConversionDetection;

  @Default("confirmed")
  @Column(DataType.STRING(20))
  status: string;

  @Default("pending")
  @Column(DataType.ENUM("pending", "calculated", "manual_override"))
  attributionStatus: string;

  @Column(DataType.DATE)
  attributionCalculatedAt: Date;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  createdBy: number;

  @BelongsTo(() => User, "createdBy")
  creator: User;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  verifiedBy: number;

  @BelongsTo(() => User, "verifiedBy")
  verifier: User;

  @Column(DataType.TEXT)
  notes: string;

  @Column(DataType.TEXT)
  internalNotes: string;

  @Column(DataType.JSON)
  metadata: object;

  @Default(DataType.NOW)
  @Column(DataType.DATE)
  convertedAt: Date;

  @CreatedAt
  @Column(DataType.DATE(6))
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE(6))
  updatedAt: Date;

  @HasMany(() => ConversionItem)
  items: ConversionItem[];

  @HasMany(() => AttributionResult)
  attributionResults: AttributionResult[];
}

export default AttributionConversion;
