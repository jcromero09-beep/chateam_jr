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
import Appointment from './Appointment';

@Table({
  tableName: 'appointment_reminders',
  timestamps: false
})
class AppointmentReminder extends Model<AppointmentReminder> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => Appointment)
  @Column(DataType.BIGINT)
  appointmentId!: number;

  @ForeignKey(() => Company)
  @Column(DataType.BIGINT)
  companyId!: number;

  @Column(DataType.STRING(50))
  reminderType!: string; // email, whatsapp, sms, push

  @Column(DataType.DATE)
  remindAt!: Date;

  @Column(DataType.INTEGER)
  minutesBefore!: number;

  @Default('pending')
  @Column(DataType.STRING(50))
  status!: string; // pending, sent, failed

  @Column(DataType.DATE)
  sentAt!: Date;

  @Column(DataType.TEXT)
  errorMessage!: string;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt!: Date;

  // Associations
  @BelongsTo(() => Appointment)
  appointment!: Appointment;

  @BelongsTo(() => Company)
  company!: Company;
}

export default AppointmentReminder;
