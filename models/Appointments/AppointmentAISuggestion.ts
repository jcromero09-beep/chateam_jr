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
  Default
} from 'sequelize-typescript';
import Company from '../Company';
import Contact from '../Contact';
import User from '../User';
import AppointmentService from '../AppointmentService';

@Table({
  tableName: 'appointment_ai_suggestions',
  timestamps: false
})
class AppointmentAISuggestion extends Model<AppointmentAISuggestion> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.BIGINT)
  companyId: number;

  @ForeignKey(() => Contact)
  @Column(DataType.BIGINT)
  contactId: number;

  @Column(DataType.STRING(50))
  suggestionType: string; // optimal_time, reschedule, follow_up

  @Column(DataType.DATE)
  suggestedTime: Date;

  @Column(DataType.FLOAT)
  confidenceScore: number;

  @Column(DataType.TEXT)
  reasoning: string;

  @Column(DataType.JSONB)
  alternativeTimes: Array<{
    time: Date;
    score: number;
    reason: string;
  }>;

  @ForeignKey(() => AppointmentService)
  @Column(DataType.BIGINT)
  serviceId: number;

  @ForeignKey(() => User)
  @Column(DataType.BIGINT)
  userId: number;

  @Default('pending')
  @Column(DataType.STRING(50))
  status: string; // pending, accepted, rejected, expired

  @Column(DataType.DATE)
  appliedAt: Date;

  @Column(DataType.STRING(50))
  aiModel: string;

  @Column(DataType.INTEGER)
  aiTokensUsed: number;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  // Associations
  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => Contact)
  contact: Contact;

  @BelongsTo(() => AppointmentService)
  service: AppointmentService;

  @BelongsTo(() => User)
  user: User;
}

export default AppointmentAISuggestion;
