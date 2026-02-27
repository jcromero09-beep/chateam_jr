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
import Company from './Company';

@Table({
  tableName: 'appointment_services',
  timestamps: true
})
class AppointmentService extends Model<AppointmentService> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.BIGINT)
  companyId: number;

  @Column(DataType.STRING(255))
  name: string;

  @Column(DataType.TEXT)
  description: string;

  @Column(DataType.INTEGER)
  duration: number; // in minutes

  @Default(0)
  @Column(DataType.INTEGER)
  bufferTime: number; // minutes before/after

  @Column(DataType.DECIMAL(10, 2))
  price: number;

  @Default('USD')
  @Column(DataType.STRING(3))
  currency: string;

  @Default('#007bff')
  @Column(DataType.STRING(7))
  color: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive: boolean;

  @Default(1)
  @Column(DataType.INTEGER)
  maxAttendees: number;

  @Default(false)
  @Column(DataType.BOOLEAN)
  requiresConfirmation: boolean;

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

  // Note: HasMany relationship is defined in Appointment model
}

export default AppointmentService;
