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
import Company from '../Company.js';
import Ticket from '../Ticket.js';
import WebChatSession from './WebChatSession.js';

@Table({
  tableName: 'webchat_messages',
  timestamps: false
})
class WebChatMessage extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id: number;

  @ForeignKey(() => WebChatSession)
  @Column(DataType.BIGINT)
  sessionId: number;

  @ForeignKey(() => Ticket)
  @Column(DataType.BIGINT)
  ticketId: number;

  @ForeignKey(() => Company)
  @Column(DataType.BIGINT)
  companyId: number;

  @Column({
    type: DataType.STRING(20),
    allowNull: false
  })
  direction: string;

  @Default('text')
  @Column(DataType.STRING(50))
  type: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false
  })
  content: string;

  @Default({})
  @Column(DataType.JSONB)
  metadata: object;

  @Column(DataType.DATE)
  readAt: Date;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  @BelongsTo(() => WebChatSession)
  session: WebChatSession;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @BelongsTo(() => Company)
  company: Company;
}

export default WebChatMessage;
