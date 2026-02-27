import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  CreatedAt
} from 'sequelize-typescript';
import Company from '../Company';
import IntegrationConnection from './IntegrationConnection';

@Table({
  tableName: 'integration_api_requests',
  timestamps: false
})
class IntegrationApiRequest extends Model {
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

  @Column(DataType.STRING(10))
  method: string;

  @Column(DataType.STRING(500))
  endpoint: string;

  @Column(DataType.JSONB)
  requestHeaders: Record<string, any>;

  @Column(DataType.JSONB)
  requestBody: any;

  @Column(DataType.INTEGER)
  responseStatus: number;

  @Column(DataType.JSONB)
  responseHeaders: Record<string, any>;

  @Column(DataType.JSONB)
  responseBody: any;

  @Column(DataType.INTEGER)
  durationMs: number;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  // Associations
  @BelongsTo(() => IntegrationConnection)
  connection: IntegrationConnection;

  @BelongsTo(() => Company)
  company: Company;
}

export default IntegrationApiRequest;
