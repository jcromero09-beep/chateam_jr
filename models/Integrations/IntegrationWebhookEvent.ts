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
import IntegrationConnection from './IntegrationConnection';

@Table({
  tableName: 'integration_webhook_events',
  timestamps: false
})
class IntegrationWebhookEvent extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id: number;

  @ForeignKey(() => IntegrationConnection)
  @Column(DataType.BIGINT)
  connectionId: number;

  @ForeignKey(() => Company)
  @Column(DataType.BIGINT)
  companyId: number;

  @Column(DataType.STRING(100))
  eventType: string;

  @Column(DataType.STRING(255))
  eventId: string; // ID del evento en el sistema externo

  @Column(DataType.JSONB)
  payload: Record<string, any>;

  @Column(DataType.JSONB)
  headers: Record<string, any>;

  @CreatedAt
  @Column(DataType.DATE)
  receivedAt: Date;

  @Column(DataType.DATE)
  processedAt: Date;

  @Default('pending')
  @Column(DataType.STRING(50))
  status: string;

  @Default(0)
  @Column(DataType.INTEGER)
  processingAttempts: number;

  @Column(DataType.TEXT)
  errorMessage: string;

  @Column(DataType.JSONB)
  responseSent: Record<string, any>;

  // Associations
  @BelongsTo(() => IntegrationConnection)
  connection: IntegrationConnection;

  @BelongsTo(() => Company)
  company: Company;
}

export default IntegrationWebhookEvent;
