import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  HasMany,
  CreatedAt,
  UpdatedAt,
  Default,
  Unique
} from 'sequelize-typescript';
import IntegrationConnection from './IntegrationConnection';

@Table({
  tableName: 'integration_providers',
  timestamps: true
})
class IntegrationProvider extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id: number;

  @Unique
  @Column(DataType.STRING(100))
  name: string;

  @Column(DataType.STRING(255))
  displayName: string;

  @Column(DataType.TEXT)
  description: string;

  @Column(DataType.STRING(50))
  providerType: string; // billing, crm, tracking, resource_management

  @Column(DataType.STRING(500))
  baseUrl: string;

  @Column(DataType.STRING(50))
  authType: string; // api_key, oauth2, basic, custom

  @Default('active')
  @Column(DataType.STRING(50))
  status: string;

  @Default({})
  @Column(DataType.JSONB)
  capabilities: Record<string, any>;

  @Default({})
  @Column(DataType.JSONB)
  defaultConfig: Record<string, any>;

  @Default(false)
  @Column(DataType.BOOLEAN)
  webhookSupport: boolean;

  @Column(DataType.STRING(500))
  iconUrl: string;

  @Column(DataType.STRING(500))
  documentationUrl: string;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt: Date;

  // Associations
  @HasMany(() => IntegrationConnection)
  connections: IntegrationConnection[];
}

export default IntegrationProvider;
