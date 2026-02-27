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
import Contact from '../Contact';
import Ticket from '../Ticket';
import AppointmentService from '../AppointmentService';
import AppointmentReminder from './AppointmentReminder';
import ReminderTemplate from './ReminderTemplate';

@Table({
  tableName: 'appointments',
  timestamps: true
})
class Appointment extends Model<Appointment> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @ForeignKey(() => AppointmentService)
  @Column(DataType.INTEGER)
  serviceId: number;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  userId: number; // assigned agent/staff

  @ForeignKey(() => Contact)
  @Column(DataType.INTEGER)
  contactId: number;

  @ForeignKey(() => Ticket)
  @Column(DataType.INTEGER)
  ticketId: number;

  @ForeignKey(() => ReminderTemplate)
  @Column(DataType.INTEGER)
  reminderTemplateId: number;

  @Column(DataType.STRING(255))
  title: string;

  @Column(DataType.TEXT)
  description: string;

  @Column(DataType.DATE)
  startTime: Date;

  @Column(DataType.DATE)
  endTime: Date;

  @Column(DataType.INTEGER)
  duration: number; // in minutes

  @Default('UTC')
  @Column(DataType.STRING(50))
  timezone: string;

  @Default('scheduled')
  @Column(DataType.STRING(50))
  status: string; // scheduled, confirmed, completed, cancelled, no_show

  @Column(DataType.STRING(255))
  attendeeName: string;

  @Column(DataType.STRING(255))
  attendeeEmail: string;

  @Column(DataType.STRING(50))
  attendeePhone: string;

  @Default(1)
  @Column(DataType.INTEGER)
  attendeeCount: number;

  @Column(DataType.STRING(255))
  location: string;

  @Default('in_person')
  @Column(DataType.STRING(50))
  locationType: string; // in_person, phone, video, custom

  @Column(DataType.TEXT)
  meetingUrl: string;

  @Column(DataType.STRING(50))
  meetingPlatform: string; // zoom, google_meet, teams, etc.

  @Column(DataType.TEXT)
  notes: string;

  @Column(DataType.TEXT)
  internalNotes: string;

  @Column(DataType.TEXT)
  cancellationReason: string;

  @ForeignKey(() => Appointment)
  @Column(DataType.INTEGER)
  rescheduledFrom: number;

  @ForeignKey(() => Appointment)
  @Column(DataType.INTEGER)
  rescheduledTo: number;

  @Column(DataType.STRING(255))
  googleCalendarEventId: string;

  @Column(DataType.STRING(255))
  outlookCalendarEventId: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  reminderSent: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  confirmationSent: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  aiSuggested: boolean;

  @Column(DataType.JSONB)
  aiOptimizationData: Record<string, any>;

  @Default({})
  @Column(DataType.JSONB)
  metadata: Record<string, any>;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  createdBy: number;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt: Date;

  @Column(DataType.DATE)
  cancelledAt: Date;

  @Column(DataType.DATE)
  confirmedAt: Date;

  @Column(DataType.DATE)
  completedAt: Date;

  // Associations
  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => AppointmentService)
  service: AppointmentService;

  @BelongsTo(() => User, 'userId')
  assignedUser: User;

  @BelongsTo(() => Contact)
  contact: Contact;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @BelongsTo(() => ReminderTemplate)
  reminderTemplate: ReminderTemplate;

  @BelongsTo(() => User, 'createdBy')
  creator: User;

  @BelongsTo(() => Appointment, 'rescheduledFrom')
  originalAppointment: Appointment;

  @BelongsTo(() => Appointment, 'rescheduledTo')
  newAppointment: Appointment;

  @HasMany(() => AppointmentReminder)
  reminders: AppointmentReminder[];
}

export default Appointment;
