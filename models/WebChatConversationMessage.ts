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
  UpdatedAt,
  Default
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";
import WebChatConversation from "./WebChatConversation";

@Table({
  tableName: "WebChatConversationMessages",
  timestamps: true
})
class WebChatConversationMessage extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => WebChatConversation)
  @Column(DataType.INTEGER)
  conversationId: number;

  @BelongsTo(() => WebChatConversation)
  conversation: WebChatConversation;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  direction: "inbound" | "outbound";

  @Column({
    type: DataType.TEXT,
    allowNull: false
  })
  body: string;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  senderId: number;

  @BelongsTo(() => User)
  sender: User;

  @Default("text")
  @Column(DataType.STRING)
  type: string;

  @Default({})
  @Column(DataType.JSONB)
  metadata: Record<string, any>;

  @Column(DataType.DATE)
  readAt: Date;

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt: Date;
}

export default WebChatConversationMessage;
