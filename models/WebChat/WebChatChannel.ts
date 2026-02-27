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
import Company from '../Company.js';
import Queue from '../Queue.js';
import WebChatSession from './WebChatSession.js';

@Table({
  tableName: 'webchat_channels',
  timestamps: true
})
class WebChatChannel extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.BIGINT)
  companyId: number;

  @Column({
    type: DataType.STRING(100),
    unique: true,
    allowNull: false
  })
  channelId: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false
  })
  name: string;

  @Column(DataType.TEXT)
  description: string;

  @Default('active')
  @Column(DataType.STRING(50))
  status: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false
  })
  webhookSecret: string;

  @Column(DataType.TEXT)
  allowedDomains: string;

  @Default({})
  @Column(DataType.JSONB)
  themeConfig: object;

  @ForeignKey(() => Queue)
  @Column(DataType.BIGINT)
  autoAssignQueueId: number;

  @Default(86400)
  @Column(DataType.INTEGER)
  sessionTimeout: number;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt: Date;

  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => Queue)
  queue: Queue;

  @HasMany(() => WebChatSession)
  sessions: WebChatSession[];
}

export default WebChatChannel;
