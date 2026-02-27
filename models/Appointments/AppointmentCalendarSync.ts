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
  Default,
  Unique
} from 'sequelize-typescript';
import Company from '../Company';
import User from '../User';

@Table({
  tableName: 'appointment_calendar_sync',
  timestamps: true
})
class AppointmentCalendarSync extends Model<AppointmentCalendarSync> {
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

  @Column(DataType.STRING(50))
  provider: string; // google, outlook, apple

  @Column(DataType.STRING(255))
  calendarId: string;

  @Column(DataType.STRING(255))
  calendarName: string;

  @Column(DataType.TEXT)
  accessToken: string;

  @Column(DataType.TEXT)
  refreshToken: string;

  @Column(DataType.DATE)
  tokenExpiresAt: Date;

  @Default(true)
  @Column(DataType.BOOLEAN)
  syncEnabled: boolean;

  @Column(DataType.DATE)
  lastSyncAt: Date;

  @Default('bidirectional')
  @Column(DataType.STRING(50))
  syncDirection: string; // bidirectional, to_calendar, from_calendar

  @Default({})
  @Column(DataType.JSONB)
  settings: Record<string, any>;

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
}

export default AppointmentCalendarSync;
