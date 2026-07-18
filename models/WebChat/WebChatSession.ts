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
  Default
} from 'sequelize-typescript';
import Company from '../Company.js';
import Contact from '../Contact.js';
import Ticket from '../Ticket.js';
import WebChatChannel from './WebChatChannel.js';
import WebChatMessage from './WebChatMessage.js';

@Table({
  tableName: 'webchat_sessions',
  timestamps: false
})
class WebChatSession extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id: number;

  @Column({
    type: DataType.STRING(100),
    unique: true,
    allowNull: false
  })
  sessionId: string;

  @ForeignKey(() => WebChatChannel)
  @Column(DataType.BIGINT)
  channelId: number;

  @ForeignKey(() => Company)
  @Column(DataType.BIGINT)
  companyId: number;

  @ForeignKey(() => Contact)
  @Column(DataType.BIGINT)
  contactId: number;

  @ForeignKey(() => Ticket)
  @Column(DataType.BIGINT)
  ticketId: number;

  @Default('active')
  @Column(DataType.STRING(50))
  status: string;

  @Default({})
  @Column(DataType.JSONB)
  metadata: object;

  @Column(DataType.TEXT)
  userAgent: string;

  @Column(DataType.STRING(45))
  ipAddress: string;

  @CreatedAt
  @Column(DataType.DATE)
  startedAt: Date;

  @Column(DataType.DATE)
  lastMessageAt: Date;

  @Column(DataType.DATE)
  closedAt: Date;

  @BelongsTo(() => WebChatChannel)
  channel: WebChatChannel;

  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => Contact)
  contact: Contact;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @HasMany(() => WebChatMessage)
  messages: WebChatMessage[];
}

export default WebChatSession;
