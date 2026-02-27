import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import Company from "./Company";
import Contact from "./Contact";
import Campaign from "./Campaign";
import CampaignShipping from "./CampaignShipping";
import Message from "./Message";
import Ticket from "./Ticket";

@Table({ tableName: "AttributionTouchpoints" })
class AttributionTouchpoint extends Model<AttributionTouchpoint> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => Contact)
  @Column(DataType.INTEGER)
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @Column(DataType.STRING)
  channel: string;

  @Column(DataType.STRING)
  touchpointType: string;

  @ForeignKey(() => Campaign)
  @Column(DataType.INTEGER)
  campaignId: number;

  @BelongsTo(() => Campaign)
  campaign: Campaign;

  @ForeignKey(() => CampaignShipping)
  @Column(DataType.INTEGER)
  campaignShippingId: number;

  @BelongsTo(() => CampaignShipping)
  campaignShipping: CampaignShipping;

  @ForeignKey(() => Message)
  @Column(DataType.INTEGER)
  messageId: number;

  @BelongsTo(() => Message)
  message: Message;

  @ForeignKey(() => Ticket)
  @Column(DataType.INTEGER)
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @Column(DataType.STRING)
  ctwaClid: string;

  @Column(DataType.STRING)
  fbclid: string;

  @Column(DataType.STRING)
  facebookCampaignId: string;

  @Column(DataType.STRING)
  facebookAdsetId: string;

  @Column(DataType.STRING)
  facebookAdId: string;

  @Column(DataType.STRING)
  utmSource: string;

  @Column(DataType.STRING)
  utmMedium: string;

  @Column(DataType.STRING)
  utmCampaign: string;

  @Column(DataType.STRING)
  utmTerm: string;

  @Column(DataType.STRING)
  utmContent: string;

  @Column(DataType.DATE)
  touchpointTimestamp: Date;

  @Column(DataType.STRING)
  sessionId: string;

  @Column(DataType.JSON)
  deviceInfo: object;

  @Column(DataType.JSON)
  metadata: object;

  @Column(DataType.STRING)
  journeyId: string;

  @Column(DataType.INTEGER)
  sequenceNumber: number;

  @CreatedAt
  @Column(DataType.DATE(6))
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE(6))
  updatedAt: Date;
}

export default AttributionTouchpoint;
