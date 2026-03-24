import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  Default,
  AllowNull,
  BelongsTo,
  ForeignKey
} from "sequelize-typescript";
import Contact from "./Contact";
import Ticket from "./Ticket";
import Company from "./Company";
import Queue from "./Queue";
import TicketTraking from "./TicketTraking";
import Whatsapp from "./Whatsapp";

@Table
class Message extends Model<Message> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column(DataType.STRING)
  remoteJid: string;

  @Column(DataType.STRING)
  participant: string;

  @Column(DataType.STRING)
  dataJson: string;

  @Default(0)
  @Column(DataType.INTEGER)
  ack: number;

  @Default(false)
  @Column(DataType.BOOLEAN)
  read: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  fromMe: boolean;

  @Column(DataType.TEXT)
  body: string;

  @Column(DataType.STRING)
  mediaUrl: string;

  // El getter mediaUrl ahora simplemente retorna el valor de la BD
  // La construcción de la URL completa se hace en el frontend
  // para evitar duplicación: /public/companyX/http://backend/public/companyX/archivo.jpg
  get mediaUrlWithBaseUrl(): string | null {
    if (this.getDataValue("mediaUrl")) {
      return `${process.env.BACKEND_URL || ''}${process.env.PROXY_PORT ? `:${process.env.PROXY_PORT}` : ''}/public/company${this.companyId}/${this.getDataValue("mediaUrl")}`;
    }
    return null;
  }

  @Column(DataType.STRING)
  mediaType: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isDeleted: boolean;

  @Column(DataType.DATE(6))
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE(6))
  updatedAt: Date;

  @ForeignKey(() => Message)
  @Column(DataType.INTEGER)
  quotedMsgId: string;

  @BelongsTo(() => Message, "quotedMsgId")
  quotedMsg: Message;

  @ForeignKey(() => Ticket)
  @Column(DataType.INTEGER)
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @ForeignKey(() => TicketTraking)
  @Column(DataType.INTEGER)
  ticketTrakingId: number;

  @BelongsTo(() => TicketTraking, "ticketTrakingId")
  ticketTraking: TicketTraking;

  @ForeignKey(() => Contact)
  @Column(DataType.INTEGER)
  contactId: number;

  @BelongsTo(() => Contact, "contactId")
  contact: Contact;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => Queue)
  @Column(DataType.INTEGER)
  queueId: number;

  @BelongsTo(() => Queue)
  queue: Queue;

  @ForeignKey(() => Whatsapp)
  @Column(DataType.INTEGER)
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @Column(DataType.STRING)
  provider: string;

  @Column(DataType.STRING)
  externalId: string;

  @Column(DataType.STRING)
  wid: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isPrivate: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isEdited: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isForwarded: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isPinned: boolean;

  // ===== Campo de Coexistencia Meta =====

  @AllowNull(true)
  @Column(DataType.STRING(50))
  sourceChannel: string;

  // ===== Campos para Agentes IA =====

  @AllowNull(true)
  @Column(DataType.STRING(100))
  agentUsed: string;

  @AllowNull(true)
  @Column(DataType.STRING(100))
  intent: string;

  @AllowNull(true)
  @Column(DataType.DECIMAL(3, 2))
  confidenceScore: number;

  // ===== Campos para Cola de Mensajes Offline =====

  @Default("pending")
  @Column(DataType.ENUM("pending", "sent", "failed", "deleted"))
  messageStatus: "pending" | "sent" | "failed" | "deleted";

  @Default(0)
  @Column(DataType.INTEGER)
  sendAttempts: number;

  @Column(DataType.DATE(6))
  sentAt: Date;
}

export default Message;