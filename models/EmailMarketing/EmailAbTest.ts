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
import EmailCampaign from './EmailCampaign';

@Table({
  tableName: 'email_ab_tests',
  timestamps: true
})
class EmailAbTest extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.BIGINT)
  companyId: number;

  @ForeignKey(() => EmailCampaign)
  @Column({
    type: DataType.BIGINT,
    allowNull: false
  })
  campaignId: number;

  @Column({
    type: DataType.STRING(255),
    allowNull: false
  })
  name: string;

  @Default('subject')
  @Column(DataType.STRING(50))
  testType: string;
  // Valores: 'subject', 'content', 'send_time'

  @Default('draft')
  @Column(DataType.STRING(50))
  status: string;
  // Valores: 'draft', 'running', 'completed', 'cancelled'

  @Column({
    type: DataType.JSONB,
    allowNull: false
  })
  variants: object;
  // Array de variantes: [{ id: 'A', subject: '...', content: '...', percentage: 20 }, ...]

  @Default('open_rate')
  @Column(DataType.STRING(50))
  winnerCriteria: string;
  // Valores: 'open_rate', 'click_rate'

  @Column(DataType.STRING(10))
  winnerVariantId: string;

  @Default(20)
  @Column(DataType.INTEGER)
  testPercentage: number;

  @Default(4)
  @Column(DataType.INTEGER)
  testDurationHours: number;

  @Column(DataType.JSONB)
  results: object;
  // Formato: { A: { sent: 100, opened: 30, clicked: 10 }, B: { ... } }

  @Column(DataType.DATE)
  decidedAt: Date;

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

  @BelongsTo(() => EmailCampaign)
  campaign: EmailCampaign;

  @BelongsTo(() => User)
  creator: User;
}

export default EmailAbTest;
