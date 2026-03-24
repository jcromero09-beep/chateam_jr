import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  HasMany,
  CreatedAt,
  UpdatedAt,
  Default
} from 'sequelize-typescript';
import Company from '../Company';
import Contact from '../Contact';
import EmailCampaign from './EmailCampaign';
import EmailTrackingEvent from './EmailTrackingEvent';

@Table({
  tableName: 'email_campaign_recipients',
  timestamps: true
})
class EmailCampaignRecipient extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id: number;

  @ForeignKey(() => EmailCampaign)
  @Column(DataType.BIGINT)
  campaignId: number;

  @ForeignKey(() => Company)
  @Column(DataType.BIGINT)
  companyId: number;

  @ForeignKey(() => Contact)
  @Column(DataType.BIGINT)
  contactId: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false
  })
  email: string;

  @Column(DataType.STRING(255))
  name: string;

  @Default({})
  @Column(DataType.JSONB)
  personalizationData: object;

  @Default('pending')
  @Column(DataType.STRING(50))
  status: string;

  @Column(DataType.DATE)
  sentAt: Date;

  @Column(DataType.DATE)
  deliveredAt: Date;

  @Column(DataType.DATE)
  openedAt: Date;

  @Column(DataType.DATE)
  firstOpenedAt: Date;

  @Column(DataType.DATE)
  clickedAt: Date;

  @Column(DataType.DATE)
  firstClickedAt: Date;

  @Column(DataType.DATE)
  bouncedAt: Date;

  @Column(DataType.STRING(50))
  bounceType: string;

  @Column(DataType.TEXT)
  bounceReason: string;

  @Column(DataType.DATE)
  unsubscribedAt: Date;

  @Column(DataType.DATE)
  spamComplaintAt: Date;

  @Column(DataType.STRING(255))
  providerMessageId: string;

  @Default(0)
  @Column(DataType.INTEGER)
  openCount: number;

  @Default(0)
  @Column(DataType.INTEGER)
  clickCount: number;

  @Column(DataType.TEXT)
  errorMessage: string;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt: Date;

  @BelongsTo(() => EmailCampaign)
  campaign: EmailCampaign;

  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => Contact)
  contact: Contact;

  @HasMany(() => EmailTrackingEvent, { foreignKey: 'recipientId' })
  trackingEvents: EmailTrackingEvent[];
}

export default EmailCampaignRecipient;
