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
import IntegrationConnection from './IntegrationConnection';

@Table({
  tableName: 'integration_entity_mappings',
  timestamps: true
})
class IntegrationEntityMapping extends Model {
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
  entityType: string; // contact, company, ticket, invoice

  @Column(DataType.BIGINT)
  localEntityId: number;

  @Column(DataType.STRING(255))
  externalEntityId: string;

  @Column(DataType.STRING(100))
  externalEntityType: string;

  @Default('bidirectional')
  @Column(DataType.STRING(50))
  syncDirection: string;

  @Column(DataType.DATE)
  lastSyncedAt: Date;

  @Column(DataType.JSONB)
  localData: Record<string, any>;

  @Column(DataType.JSONB)
  externalData: Record<string, any>;

  @Default({})
  @Column(DataType.JSONB)
  metadata: Record<string, any>;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt: Date;

  // Associations
  @BelongsTo(() => IntegrationConnection)
  connection: IntegrationConnection;

  @BelongsTo(() => Company)
  company: Company;
}

export default IntegrationEntityMapping;
