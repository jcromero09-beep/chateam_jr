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
import AppointmentService from '../AppointmentService';

@Table({
  tableName: 'appointment_availability',
  timestamps: true
})
class AppointmentAvailability extends Model<AppointmentAvailability> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.BIGINT)
  companyId: number;

  @ForeignKey(() => User)
  @Column(DataType.BIGINT)
  userId: number;

  @ForeignKey(() => AppointmentService)
  @Column(DataType.BIGINT)
  serviceId: number;

  @Column(DataType.INTEGER)
  dayOfWeek: number; // 0=Sunday, 6=Saturday

  @Column(DataType.TIME)
  startTime: string;

  @Column(DataType.TIME)
  endTime: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isAvailable: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isBooked: boolean;

  @Column(DataType.BIGINT)
  bookedByAppointmentId: number;

  @Default('UTC')
  @Column(DataType.STRING(50))
  timezone: string;

  @Column(DataType.DATEONLY)
  effectiveFrom: Date;

  @Column(DataType.DATEONLY)
  effectiveUntil: Date;

  @Column(DataType.TEXT)
  recurrenceRule: string;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt: Date;

  // Associations
  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => User)
  user: User;

  @BelongsTo(() => AppointmentService)
  service: AppointmentService;
}

export default AppointmentAvailability;
