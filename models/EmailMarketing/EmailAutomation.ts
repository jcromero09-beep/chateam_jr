import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  Default
} from 'sequelize-typescript';
import Company from '../Company';
import User from '../User';
import EmailTemplate from './EmailTemplate';
import ContactList from '../ContactList';

@Table({
  tableName: 'email_automations',
  timestamps: true
})
class EmailAutomation extends Model {
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

  @Column(DataType.TEXT)
  description: string;

  @Column({
    type: DataType.STRING(50),
    allowNull: false
  })
  triggerType: string;
  // Valores: 'contact_added', 'contact_tag_added', 'campaign_opened',
  //          'campaign_not_opened', 'link_clicked', 'date_trigger', 'inactivity'

  @Default({})
  @Column(DataType.JSONB)
  triggerConfig: object;
  // Config especifica del trigger, e.g.: { listId: 1, delay: 3600, tagId: 5 }

  @Default('draft')
  @Column(DataType.STRING(50))
  status: string;
  // Valores: 'draft', 'active', 'paused', 'completed'

  @ForeignKey(() => EmailTemplate)
  @Column(DataType.BIGINT)
  emailTemplateId: number;

  @Column(DataType.STRING(500))
  emailSubject: string;

  @Column(DataType.TEXT)
  emailContent: string;

  @Default(0)
  @Column(DataType.INTEGER)
  delaySeconds: number;

  @ForeignKey(() => ContactList)
  @Column(DataType.INTEGER)
  contactListId: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalTriggered: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalSent: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalOpened: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalClicked: number;

  @Column(DataType.DATE)
  lastTriggeredAt: Date;

  @ForeignKey(() => User)
  @Column(DataType.BIGINT)
  createdBy: number;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive: boolean;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt: Date;

  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => User)
  creator: User;

  @BelongsTo(() => EmailTemplate)
  template: EmailTemplate;

  @BelongsTo(() => ContactList)
  contactList: ContactList;
}

export default EmailAutomation;
