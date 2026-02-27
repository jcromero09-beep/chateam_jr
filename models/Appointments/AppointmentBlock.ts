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
import User from '../User';

@Table({
  tableName: 'appointment_blocks',
  timestamps: false
})
class AppointmentBlock extends Model<AppointmentBlock> {
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

  @Column(DataType.STRING(255))
  title: string;

  @Column(DataType.DATE)
  startTime: Date;

  @Column(DataType.DATE)
  endTime: Date;

  @Column(DataType.TEXT)
  reason: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isRecurring: boolean;

  @Column(DataType.TEXT)
  recurrenceRule: string;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  // Associations
  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => User)
  user: User;
}

export default AppointmentBlock;
