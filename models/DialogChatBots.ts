import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo
,
  DataType
} from "sequelize-typescript";
import Chatbot from "./Chatbot";
import Contact from "./Contact";
import Queue from "./Queue";

@Table
class DialogChatBots extends Model<DialogChatBots> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column(DataType.INTEGER)
  awaiting: number;

  @ForeignKey(() => Contact)
  @Column(DataType.INTEGER)
  contactId: number;

  @ForeignKey(() => Queue)
  @Column(DataType.INTEGER)
  queueId: number;

  @ForeignKey(() => Chatbot)
  @Column(DataType.INTEGER)
  chatbotId: number;

  @BelongsTo(() => Chatbot)
  chatbots: Chatbot;

  /**
   * La FK a Contact ya existía; faltaba la asociación. Sin ella no había forma
   * de acotar un DialogChatBots a una empresa: esta tabla NO tiene `companyId`,
   * así que el guard de tenant nunca la enganchó ni podía. El tenant se hereda
   * del contacto (ver ShowDialogChatBotsServices).
   */
  @BelongsTo(() => Contact)
  contact: Contact;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default DialogChatBots;
