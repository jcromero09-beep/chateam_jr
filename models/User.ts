import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  DataType,
  BeforeCreate,
  BeforeUpdate,
  PrimaryKey,
  AutoIncrement,
  Default,
  HasMany,
  BelongsToMany,
  ForeignKey,
  BelongsTo,
  BeforeDestroy
} from "sequelize-typescript";
import { hash, compare } from "bcryptjs";
import Ticket from "./Ticket";
import Queue from "./Queue";
import UserQueue from "./UserQueue";
import Company from "./Company";
import QuickMessage from "./QuickMessage";
import Whatsapp from "./Whatsapp";
import Chatbot from "./Chatbot";

@Table
class User extends Model<User> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column(DataType.STRING)
  name: string;

  @Column(DataType.STRING)
  email: string;

  @Column(DataType.VIRTUAL)
  password: string;

  @Column(DataType.STRING)
  passwordHash: string;

  @Default(0)
  @Column(DataType.INTEGER)
  tokenVersion: number;

  @Default("admin")
  @Column(DataType.STRING)
  profile: string;

  @Default(null)
  @Column(DataType.STRING)
  profileImage: string;
  
  @ForeignKey(() => Whatsapp)
  @Column(DataType.INTEGER)
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;
  
  @Column(DataType.BOOLEAN)
  super: boolean;

  @Column(DataType.BOOLEAN)
  online: boolean;

  @Default("00:00")
  @Column(DataType.STRING)
  startWork: string;

  @Default("23:59")
  @Column(DataType.STRING)
  endWork: string;

  @Default("")
  @Column(DataType.STRING)
  color: string;

  @Default("disable")
  @Column(DataType.STRING)
  allTicket: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  allowGroup: boolean;

  @Default("light")
  @Column(DataType.STRING)
  defaultTheme: string;

  @Default("closed")
  @Column(DataType.STRING)
  defaultMenu: string;

  @Default("")
  @Column(DataType.TEXT)
  farewellMessage: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @HasMany(() => Ticket)
  tickets: Ticket[];

  @BelongsToMany(() => Queue, () => UserQueue)
  queues: Queue[];

  @HasMany(() => QuickMessage, {
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
    hooks: true
  })
  quickMessages: QuickMessage[];

  @BeforeUpdate
  @BeforeCreate
  static hashPassword = async (instance: User): Promise<void> => {
    if (instance.password) {
      instance.passwordHash = await hash(instance.password, 8);
    }
  };

  public checkPassword = async (password: string): Promise<boolean> => {
    return compare(password, this.getDataValue("passwordHash"));
  };

  @Default("disabled")
  @Column(DataType.STRING)
  allHistoric: string;

  @HasMany(() => Chatbot, {
    onUpdate: "SET NULL",
    onDelete: "SET NULL",
    hooks: true
  })
  chatbot: Chatbot[];

  @Default("disabled")
  @Column(DataType.STRING)
  allUserChat: string;

  @Default("enabled")
  @Column(DataType.STRING)
  userClosePendingTicket: string;

  @Default("disabled")
  @Column(DataType.STRING)
  showDashboard: string;

  @Default(550)
  @Column(DataType.INTEGER)
  defaultTicketsManagerWidth: number;

  @Default("disable")
  @Column(DataType.STRING)
  allowRealTime: string;

  @Default("disable")
  @Column(DataType.STRING)
  allowConnections: string;

  @BeforeDestroy
  static async updateChatbotsUsersReferences(user: User) {
    // Atualizar os registros na tabela Chatbots onde optQueueId é igual ao ID da fila que será excluída
    await Chatbot.update({ optUserId: null }, { where: { optUserId: user.id } });
  }
}

export default User;
