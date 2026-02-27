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
  tableName: 'email_provider_configs',
  timestamps: true
})
class EmailProviderConfig extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.BIGINT)
  companyId: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: false
  })
  provider: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false
  })
  apiKey: string;

  @Column(DataType.TEXT)
  apiSecret: string;

  @Column(DataType.STRING(255))
  domain: string;

  @Column(DataType.STRING(50))
  region: string;

  @Column(DataType.STRING(255))
  verifiedSenderEmail: string;

  @Column(DataType.STRING(255))
  verifiedSenderName: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive: boolean;

  @Default(10000)
  @Column(DataType.INTEGER)
  dailyLimit: number;

  @Default(1000)
  @Column(DataType.INTEGER)
  hourlyLimit: number;

  @Default({})
  @Column(DataType.JSONB)
  settings: object;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt: Date;

  @BelongsTo(() => Company)
  company: Company;
}

export default EmailProviderConfig;
