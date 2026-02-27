import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  HasMany
,
  DataType
} from "sequelize-typescript";
import CampaignShipping from "./CampaignShipping";
import Company from "./Company";
import ContactList from "./ContactList";
import Whatsapp from "./Whatsapp";
import User from "./User";
import Queue from "./Queue";

@Table({ tableName: "Campaigns" })
class Campaign extends Model<Campaign> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column(DataType.STRING)
  name: string;

  @Column({ type: DataType.STRING, defaultValue: "" })
  message1: string;

  @Column({ type: DataType.STRING, defaultValue: "" })
  message2: string;

  @Column({ type: DataType.STRING, defaultValue: "" })
  message3: string;

  @Column({ type: DataType.STRING, defaultValue: "" })
  message4: string;

  @Column({ type: DataType.STRING, defaultValue: "" })
  message5: string;

  @Column({ type: DataType.STRING, defaultValue: "" })
  confirmationMessage1: string;

  @Column({ type: DataType.STRING, defaultValue: "" })
  confirmationMessage2: string;

  @Column({ type: DataType.STRING, defaultValue: "" })
  confirmationMessage3: string;

  @Column({ type: DataType.STRING, defaultValue: "" })
  confirmationMessage4: string;

  @Column({ type: DataType.STRING, defaultValue: "" })
  confirmationMessage5: string;

  @Column({ type: DataType.STRING, defaultValue: "INATIVA" })
  status: string; // INATIVA, PROGRAMADA, EM_ANDAMENTO, CANCELADA, FINALIZADA

  @Column(DataType.BOOLEAN)
  confirmation: boolean;

  @Column(DataType.STRING)
  mediaPath: string;

  @Column(DataType.STRING)
  mediaName: string;

  @Column(DataType.DATE)
  scheduledAt?: Date;

  @Column(DataType.DATE)
  completedAt?: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => ContactList)
  @Column(DataType.INTEGER)
  contactListId: number;

  @BelongsTo(() => ContactList)
  contactList: ContactList;

  @ForeignKey(() => Whatsapp)
  @Column(DataType.INTEGER)
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @HasMany(() => CampaignShipping)
  shipping: CampaignShipping[];

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @ForeignKey(() => Queue)
  @Column(DataType.INTEGER)
  queueId: number;

  @BelongsTo(() => Queue)
  queue: Queue;

  @Column({ type: DataType.STRING, defaultValue: "closed" })
  statusTicket: string;

  @Column({ type: DataType.STRING, defaultValue: "disabled" })
  openTicket: string;
}

export default Campaign;
