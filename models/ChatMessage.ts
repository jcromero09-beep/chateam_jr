import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  BelongsTo,
  ForeignKey,
  Default
,
  DataType
} from "sequelize-typescript";
import User from "./User";
import Chat from "./Chat";
import Company from "./Company";

@Table({ tableName: "ChatMessages" })
class ChatMessage extends Model<ChatMessage> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Chat)
  @Column(DataType.INTEGER)
  chatId: number;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  senderId: number;

  @Column({ type: DataType.STRING, defaultValue: "" })
  message: string;

  @Column(DataType.STRING)
  mediaPath: string;

  @Column(DataType.STRING)
  mediaName: string;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isPinned: boolean;

  @Default('sent')
  @Column(DataType.STRING)
  status: string; // 'sent', 'delivered', 'read'

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @Column(DataType.DATE)
  readAt?: Date;

  @Column(DataType.DATE)
  deliveredAt?: Date;

  @BelongsTo(() => Chat)
  chat: Chat;

  @BelongsTo(() => User)
  sender: User;

  @BelongsTo(() => Company)
  company: Company;
}

export default ChatMessage;
