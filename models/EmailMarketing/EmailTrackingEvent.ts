import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  Default
} from 'sequelize-typescript';
import Company from '../Company';
import EmailCampaign from './EmailCampaign';
import EmailCampaignRecipient from './EmailCampaignRecipient';

@Table({
  tableName: 'email_tracking_events',
  timestamps: false
})
class EmailTrackingEvent extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id: number;

  @ForeignKey(() => EmailCampaignRecipient)
  @Column(DataType.BIGINT)
  recipientId: number;

  @ForeignKey(() => EmailCampaign)
  @Column(DataType.BIGINT)
  campaignId: number;

  @ForeignKey(() => Company)
  @Column(DataType.BIGINT)
  companyId: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: false
  })
  eventType: string;

  @Default({})
  @Column(DataType.JSONB)
  eventData: object;

  @Column(DataType.STRING(45))
  ipAddress: string;

  @Column(DataType.TEXT)
  userAgent: string;

  @Column(DataType.JSONB)
  location: object;

  @Column(DataType.STRING(50))
  deviceType: string;

  @Column(DataType.STRING(100))
  emailClient: string;

  @Column(DataType.TEXT)
  linkUrl: string;

  @Default(DataType.NOW)
  @Column(DataType.DATE)
  timestamp: Date;

  @BelongsTo(() => EmailCampaignRecipient)
  recipient: EmailCampaignRecipient;

  @BelongsTo(() => EmailCampaign)
  campaign: EmailCampaign;

  @BelongsTo(() => Company)
  company: Company;
}

export default EmailTrackingEvent;
