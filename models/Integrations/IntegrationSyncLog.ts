import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  Default
} from 'sequelize-typescript';
import Company from '../Company';
import IntegrationConnection from './IntegrationConnection';

@Table({
  tableName: 'integration_sync_logs',
  timestamps: false
})
class IntegrationSyncLog extends Model {
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

  @Column(DataType.STRING(50))
  syncType: string; // full, incremental, realtime

  @Column(DataType.STRING(50))
  direction: string; // inbound, outbound, bidirectional

  @Column(DataType.STRING(100))
  entityType: string; // customer, invoice, shipment, resource

  @Column(DataType.DATE)
  startedAt: Date;

  @Column(DataType.DATE)
  completedAt: Date;

  @Default('running')
  @Column(DataType.STRING(50))
  status: string;

  @Default(0)
  @Column(DataType.INTEGER)
  recordsProcessed: number;

  @Default(0)
  @Column(DataType.INTEGER)
  recordsCreated: number;

  @Default(0)
  @Column(DataType.INTEGER)
  recordsUpdated: number;

  @Default(0)
  @Column(DataType.INTEGER)
  recordsFailed: number;

  @Column(DataType.TEXT)
  errorMessage: string;

  @Column(DataType.JSONB)
  errorDetails: Record<string, any>;

  @Default({})
  @Column(DataType.JSONB)
  metadata: Record<string, any>;

  // Associations
  @BelongsTo(() => IntegrationConnection)
  connection: IntegrationConnection;

  @BelongsTo(() => Company)
  company: Company;
}

export default IntegrationSyncLog;
