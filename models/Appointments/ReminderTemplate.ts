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

@Table({
  tableName: 'reminder_templates',
  timestamps: true
})
class ReminderTemplate extends Model<ReminderTemplate> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.BIGINT)
  companyId: number;

  @Column(DataType.STRING(255))
  name: string;

  @Column(DataType.STRING(50))
  channel: string; // whatsapp, email

  @Column(DataType.STRING(255))
  subject: string; // for email

  @Column(DataType.TEXT)
  messageConfirm: string; // Mensaje para pedir confirmación (ej: "¿Vienes a tu cita?")

  @Column(DataType.TEXT)
  messageReminder: string; // Mensaje de recordatorio cuando ya confirmó (ej: "Recuerda tu cita")

  @Column(DataType.INTEGER)
  timing: number; // hours before appointment

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive: boolean;

  @Default(0)
  @Column(DataType.INTEGER)
  sentCount: number;

  @Default(0)
  @Column(DataType.DECIMAL(5, 2))
  deliveryRate: number;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt: Date;

  // Associations
  @BelongsTo(() => Company)
  company: Company;
}

export default ReminderTemplate;
