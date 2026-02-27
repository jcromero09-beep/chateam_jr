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
import IntegrationProvider from './IntegrationProvider';
import IntegrationSyncLog from './IntegrationSyncLog';
import IntegrationWebhookEvent from './IntegrationWebhookEvent';
import IntegrationEntityMapping from './IntegrationEntityMapping';

@Table({
  tableName: 'integration_connections',
  timestamps: true
})
class IntegrationConnection extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.BIGINT)
  companyId: number;

  @ForeignKey(() => IntegrationProvider)
  @Column(DataType.BIGINT)
  providerId: number;

  @Column(DataType.STRING(255))
  connectionName: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive: boolean;

  // Autenticación
  @Column(DataType.JSONB)
  authCredentials: Record<string, any>; // Encrypted

  @Column(DataType.DATE)
  authExpiresAt: Date;

  // Configuración
  @Default({})
  @Column(DataType.JSONB)
  config: Record<string, any>;

  @Default({})
  @Column(DataType.JSONB)
  fieldMappings: Record<string, any>;

  @Default({})
  @Column(DataType.JSONB)
  syncSettings: Record<string, any>;

  // Estado
  @Column(DataType.DATE)
  lastSyncAt: Date;

  @Column(DataType.TEXT)
  lastError: string;

  @Default('never_synced')
  @Column(DataType.STRING(50))
  syncStatus: string;

  // Webhooks
  @Column(DataType.STRING(500))
  webhookUrl: string;

  @Column(DataType.STRING(255))
  webhookSecret: string;

  @Default([])
  @Column(DataType.JSONB)
  webhookEvents: string[];

  @ForeignKey(() => User)
  @Column(DataType.BIGINT)
  createdBy: number;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt: Date;

  // Associations
  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => IntegrationProvider)
  provider: IntegrationProvider;

  @BelongsTo(() => User, 'createdBy')
  creator: User;

  @HasMany(() => IntegrationSyncLog)
  syncLogs: IntegrationSyncLog[];

  @HasMany(() => IntegrationWebhookEvent)
  webhookEvents: IntegrationWebhookEvent[];

  @HasMany(() => IntegrationEntityMapping)
  entityMappings: IntegrationEntityMapping[];
}

export default IntegrationConnection;
