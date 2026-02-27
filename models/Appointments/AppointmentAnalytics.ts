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
  Default,
  Unique
} from 'sequelize-typescript';
import Company from '../Company';

@Table({
  tableName: 'appointment_analytics',
  timestamps: false
})
class AppointmentAnalytics extends Model<AppointmentAnalytics> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.BIGINT)
  companyId: number;

  @Unique('unique_company_date')
  @Column(DataType.DATEONLY)
  date: Date;

  @Default(0)
  @Column(DataType.INTEGER)
  totalScheduled: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalConfirmed: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalCompleted: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalCancelled: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalNoShow: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalRescheduled: number;

  @Default(0)
  @Column(DataType.FLOAT)
  avgBookingLeadTime: number; // in hours

  @Default(0)
  @Column(DataType.FLOAT)
  avgDuration: number; // in minutes

  @Column(DataType.INTEGER)
  peakHour: number; // 0-23

  @Column(DataType.INTEGER)
  busiestDayOfWeek: number; // 0-6

  @Default(0)
  @Column(DataType.DECIMAL(10, 2))
  revenueGenerated: number;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  // Associations
  @BelongsTo(() => Company)
  company: Company;
}

export default AppointmentAnalytics;
