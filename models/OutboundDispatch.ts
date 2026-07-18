/**
 * OutboundDispatch — FASE 6 Coexistencia WhatsApp.
 *
 * Row de auditoría por cada envío saliente con trazabilidad completa.
 */
import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  AllowNull,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";
import Company from "./Company";
import Ticket from "./Ticket";
import Whatsapp from "./Whatsapp";
import Message from "./Message";
import UnifiedConversation from "./UnifiedConversation";

@Table({ tableName: "OutboundDispatches" })
class OutboundDispatch extends Model<OutboundDispatch> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @AllowNull(false)
  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @AllowNull(true)
  @ForeignKey(() => UnifiedConversation)
  @Column(DataType.UUID)
  conversationId: string | null;

  @BelongsTo(() => UnifiedConversation)
  conversation: UnifiedConversation;

  @AllowNull(true)
  @ForeignKey(() => Ticket)
  @Column(DataType.INTEGER)
  ticketId: number | null;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @AllowNull(true)
  @ForeignKey(() => Message)
  @Column(DataType.INTEGER)
  messageId: number | null;

  @BelongsTo(() => Message)
  message: Message;

  @AllowNull(true)
  @ForeignKey(() => Whatsapp)
  @Column(DataType.INTEGER)
  whatsappId: number | null;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @AllowNull(false)
  @Column(DataType.STRING(32))
  provider: string;

  @AllowNull(true)
  @Column(DataType.STRING(20))
  requestedMode: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(32))
  requestedBy: string | null;

  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  fallbackApplied: boolean;

  @AllowNull(true)
  @Column(DataType.STRING(32))
  fallbackFromProvider: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(500))
  providerMessageId: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(200))
  bodyPreview: string | null;

  @Default("queued")
  @AllowNull(false)
  @Column(DataType.STRING(20))
  status: string;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  attemptCount: number;

  @AllowNull(true)
  @Column(DataType.TEXT)
  lastError: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(64))
  traceId: string | null;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  durationMs: number | null;

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  requestedAt: Date;

  @AllowNull(true)
  @Column(DataType.DATE)
  dispatchedAt: Date | null;

  @AllowNull(true)
  @Column(DataType.DATE)
  ackedAt: Date | null;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  ackLevel: number | null;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default OutboundDispatch;
