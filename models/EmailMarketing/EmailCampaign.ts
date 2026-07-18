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
import User from '../User';
import ContactList from '../ContactList';
import EmailTemplate from './EmailTemplate';
import EmailCampaignRecipient from './EmailCampaignRecipient';

@Table({
  tableName: 'email_campaigns',
  timestamps: true
})
class EmailCampaign extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.BIGINT)
  companyId: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false
  })
  name: string;

  @Column({
    type: DataType.STRING(500),
    allowNull: false
  })
  subject: string;

  @Column(DataType.STRING(255))
  previewText: string;

  @Column(DataType.STRING(255))
  fromName: string;

  @Column(DataType.STRING(255))
  fromEmail: string;

  @Column(DataType.STRING(255))
  replyToEmail: string;

  @ForeignKey(() => EmailTemplate)
  @Column(DataType.BIGINT)
  templateId: number;

  @Column(DataType.TEXT)
  htmlContent: string;

  @Column(DataType.TEXT)
  textContent: string;

  @Default('INACTIVA')
  @Column(DataType.STRING(50))
  status: string; // INACTIVA, PROGRAMADA, EN_ANDAMENTO, CANCELADA, FINALIZADA

  @Default('standard')
  @Column(DataType.STRING(50))
  type: string;

  @Column(DataType.DATE)
  sendAt: Date;

  @Column(DataType.DATE)
  completedAt: Date;

  // Acelle Mail fields
  @Column(DataType.STRING(255))
  acelleCampaignUid: string;

  @ForeignKey(() => ContactList)
  @Column(DataType.INTEGER)
  contactListId: number;

  @Column(DataType.INTEGER)
  tagListId: number;

  @Column(DataType.STRING(255))
  mediaPath: string;

  @Column(DataType.STRING(255))
  mediaName: string;

  @Default(0)
  @Column(DataType.INTEGER)
  totalRecipients: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalSent: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalDelivered: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalOpened: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalClicked: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalBounced: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalUnsubscribed: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalSpamComplaints: number;

  @Default('listmonk')
  @Column(DataType.STRING(50))
  provider: string;

  @Column(DataType.STRING(255))
  providerCampaignId: string;

  @Default({})
  @Column(DataType.JSONB)
  settings: object;

  /**
   * Segundos entre envios de cada email. Si es 0, se usa el modo nativo
   * del provider (Listmonk envia toda la campana sin throttling propio).
   * Si es >0, se usa el modo individual_queue: cada recipient se encola
   * con delay incremental.
   */
  @Default(0)
  @Column(DataType.INTEGER)
  sendIntervalSeconds: number;

  /**
   * Modo de despacho:
   *   - 'provider_native': delegamos todo el envio al provider (campana en Listmonk/Acelle)
   *   - 'individual_queue': enviamos uno-a-uno via EmailSendQueue para respetar sendIntervalSeconds
   */
  @Default('provider_native')
  @Column(DataType.STRING(20))
  dispatchMode: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  aiOptimized: boolean;

  @Column(DataType.JSONB)
  aiOptimizationData: object;

  @Column(DataType.ARRAY(DataType.TEXT))
  tags: string[];

  @ForeignKey(() => User)
  @Column(DataType.BIGINT)
  createdBy: number;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt: Date;

  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => ContactList)
  contactList: ContactList;

  @BelongsTo(() => EmailTemplate)
  template: EmailTemplate;

  @BelongsTo(() => User)
  creator: User;

  @HasMany(() => EmailCampaignRecipient, { foreignKey: 'campaignId' })
  recipients: EmailCampaignRecipient[];
}

export default EmailCampaign;
