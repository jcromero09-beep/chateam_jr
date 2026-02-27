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
  HasMany,
  Unique,
  BelongsToMany,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import Queue from "./Queue";
import Ticket from "./Ticket";
import TelegramQueue from "./TelegramQueue";
import Company from "./Company";
import QueueIntegrations from "./QueueIntegrations";
import Prompt from "./Prompt";
import { FlowBuilderModel } from "./FlowBuilder";

@Table
class Telegram extends Model<Telegram> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING)
  name: string;

  @AllowNull(false)
  @Unique
  @Column(DataType.TEXT)
  botToken: string;

  @AllowNull(true)
  @Column(DataType.STRING)
  botUsername: string;

  @Default("DISCONNECTED")
  @Column(DataType.STRING)
  status: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  webhookUrl: string;

  @Default(false)
  @AllowNull
  @Column(DataType.BOOLEAN)
  isDefault: boolean;

  @Default(false)
  @AllowNull
  @Column(DataType.BOOLEAN)
  allowGroup: boolean;

  @Default("")
  @Column(DataType.TEXT)
  greetingMessage: string;

  @Default("")
  @Column(DataType.TEXT)
  farewellMessage: string;

  @Default("")
  @Column(DataType.TEXT)
  complationMessage: string;

  @Default("")
  @Column(DataType.TEXT)
  outOfHoursMessage: string;

  @AllowNull(true)
  @Column(DataType.STRING)
  timeInactiveMessage: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  inactiveMessage: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  ratingMessage: string;

  @Default(3)
  @Column(DataType.INTEGER)
  maxUseBotQueues: number;

  @Default("0")
  @Column(DataType.STRING)
  timeUseBotQueues: string;

  @AllowNull(true)
  @Default("0")
  @Column(DataType.STRING)
  expiresTicket: string;

  @Default(0)
  @Column(DataType.INTEGER)
  maxUseBotQueuesNPS: number;

  @Default(0)
  @Column(DataType.INTEGER)
  expiresTicketNPS: number;

  @AllowNull(true)
  @Column(DataType.STRING)
  whenExpiresTicket: string;

  @AllowNull(true)
  @Column(DataType.STRING)
  expiresInactiveMessage: string;

  @Default("disabled")
  @Column(DataType.STRING)
  groupAsTicket: string;

  @Default(0)
  @Column(DataType.INTEGER)
  timeCreateNewTicket: number;

  @Default(0)
  @Column(DataType.INTEGER)
  timeSendQueue: number;

  @AllowNull(true)
  @Column(DataType.TEXT)
  collectiveVacationMessage: string;

  @AllowNull(true)
  @Column(DataType.STRING)
  collectiveVacationStart: string;

  @AllowNull(true)
  @Column(DataType.STRING)
  collectiveVacationEnd: string;

  @AllowNull(true)
  @Column({
    type: DataType.JSONB
  })
  schedules: any[];

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  // Relaciones
  @HasMany(() => Ticket)
  tickets: Ticket[];

  @BelongsToMany(() => Queue, () => TelegramQueue)
  queues: Array<Queue & { TelegramQueue: TelegramQueue }>;

  @HasMany(() => TelegramQueue)
  telegramQueues: TelegramQueue[];

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => Queue)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  sendIdQueue: number;

  @BelongsTo(() => Queue)
  queueSend: Queue;

  @ForeignKey(() => QueueIntegrations)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  integrationId: number;

  @BelongsTo(() => QueueIntegrations)
  queueIntegrations: QueueIntegrations;

  @ForeignKey(() => Prompt)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  promptId: number;

  @BelongsTo(() => Prompt)
  prompt: Prompt;

  @ForeignKey(() => Queue)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  queueIdImportMessages: number;

  @BelongsTo(() => Queue)
  queueImport: Queue;

  @ForeignKey(() => FlowBuilderModel)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  flowIdNotPhrase: number;

  @ForeignKey(() => FlowBuilderModel)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  flowIdWelcome: number;

  @BelongsTo(() => FlowBuilderModel)
  flowBuilder: FlowBuilderModel;
}

export default Telegram;
