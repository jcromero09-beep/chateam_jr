import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  ForeignKey,
  BelongsTo,
  HasMany,
  AutoIncrement,
  Default,
  BeforeCreate,
  BelongsToMany,
  AllowNull,
  DataType
} from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";

import Contact from "./Contact";
import Message from "./Message";
import Queue from "./Queue";
import User from "./User";
import Whatsapp from "./Whatsapp";
import Telegram from "./Telegram";
import Company from "./Company";
import Tag from "./Tag";
import TicketTag from "./TicketTag";
import QueueIntegrations from "./QueueIntegrations";
import CustomerOrigin from "./CustomerOrigin";
import { format } from "date-fns";


@Table
class Ticket extends Model<Ticket> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column({ type: DataType.STRING, defaultValue: "pending" })
  status: string;

  @Column(DataType.INTEGER)
  unreadMessages: number;

  @Column(DataType.BOOLEAN)
  flowWebhook: boolean;

  @Column(DataType.INTEGER)
  lastFlowId: number;

  @Column(DataType.INTEGER)
  hashFlowId: number;

  @Column(DataType.STRING)
  flowStopped: string;

  @Column(DataType.JSON)
  dataWebhook: {} | null;

  @Default({})
  @Column(DataType.JSON)
  metadata: Record<string, any>;

  @Column(DataType.STRING)
  title: string;

  @Column(DataType.STRING)
  lastMessage: string;

  @Column(DataType.INTEGER)
  followup_count: number;

  @Default(true)
  @Column(DataType.BOOLEAN)
  followupEnabled: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isGroup: boolean;

  @Column(DataType.DATE)
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @ForeignKey(() => Contact)
  @Column(DataType.INTEGER)
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @ForeignKey(() => Whatsapp)
  @Column(DataType.INTEGER)
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @ForeignKey(() => Telegram)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  telegramId: number;

  @BelongsTo(() => Telegram)
  telegram: Telegram;

  @ForeignKey(() => Queue)
  @Column(DataType.INTEGER)
  queueId: number;

  @BelongsTo(() => Queue)
  queue: Queue;

  @Column(DataType.INTEGER)
  queueOptionId: number;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isBot: boolean;

  @HasMany(() => Message)
  messages: Message[];

  @HasMany(() => TicketTag)
  ticketTags: TicketTag[];

  @BelongsToMany(() => Tag, {
    through: () => TicketTag,
    foreignKey: 'ticketId',
    otherKey: 'tagId'
  })
  tags: Tag[];

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Default(uuidv4())
  @Column(DataType.STRING)
  uuid: string;

  @Default("whatsapp")
  @Column(DataType.STRING)
  channel: string;

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  amountUsedBotQueues: number;

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  amountUsedBotQueuesNPS: number;

  @BeforeCreate
  static setUUID(ticket: Ticket) {
    ticket.uuid = uuidv4();
  }

  @Default(false)
  @Column(DataType.BOOLEAN)
  fromMe: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  sendInactiveMessage: boolean;

  @Column(DataType.DATE)
  lgpdSendMessageAt: Date;

  @Column(DataType.DATE)
  lgpdAcceptedAt: Date;

  @Column(DataType.DATE)
  imported: Date;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isOutOfHour: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  useIntegration: boolean;

  @ForeignKey(() => QueueIntegrations)
  @Column(DataType.INTEGER)
  integrationId: number;

  @BelongsTo(() => QueueIntegrations)
  queueIntegration: QueueIntegrations;

  @ForeignKey(() => CustomerOrigin)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  customerOriginId: number;

  @BelongsTo(() => CustomerOrigin)
  customerOrigin: CustomerOrigin;

  @Column(DataType.BOOLEAN)
  isActiveDemand: boolean;

  @Column(DataType.INTEGER)
  typebotSessionId: number;

  @Default(false)
  @Column(DataType.BOOLEAN)
  typebotStatus: boolean;

  @Column(DataType.DATE)
  typebotSessionTime: Date;
}

export default Ticket;
