import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  HasMany,
  CreatedAt,
  UpdatedAt,
  Default,
  BeforeCreate
} from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";
import Company from "./Company";
import WebChatWidget from "./WebChatWidget";
import WebChatConversationMessage from "./WebChatConversationMessage";

@Table({
  tableName: "WebChatConversations",
  timestamps: true
})
class WebChatConversation extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Default(uuidv4())
  @Column(DataType.STRING)
  uuid: string;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => WebChatWidget)
  @Column(DataType.INTEGER)
  widgetId: number;

  @BelongsTo(() => WebChatWidget)
  widget: WebChatWidget;

  @Column({
    type: DataType.STRING,
    allowNull: false
  })
  sessionId: string;

  @Default("Visitante Web")
  @Column(DataType.STRING)
  visitorName: string;

  @Default("open")
  @Column(DataType.STRING)
  status: string;

  @Default(0)
  @Column(DataType.INTEGER)
  unreadMessages: number;

  @Column(DataType.TEXT)
  lastMessage: string;

  @Column(DataType.DATE)
  lastMessageAt: Date;

  @Default({})
  @Column(DataType.JSONB)
  metadata: Record<string, any>;

  @HasMany(() => WebChatConversationMessage)
  messages: WebChatConversationMessage[];

  @CreatedAt
  @Column(DataType.DATE)
  createdAt: Date;

  @UpdatedAt
  @Column(DataType.DATE)
  updatedAt: Date;

  @BeforeCreate
  static setUUID(conversation: WebChatConversation) {
    conversation.uuid = uuidv4();
  }
}

export default WebChatConversation;
