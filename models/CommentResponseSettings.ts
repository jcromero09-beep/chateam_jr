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
  Default,
  AllowNull,
  Index
} from "sequelize-typescript";
import Company from "./Company";
import Whatsapp from "./Whatsapp";
import UGCSocialPost from "./UGCSocialPost";
import AIAgentConfig from "./AIAgentConfig";

type ResponseMode = "manual" | "auto_message" | "ai";

@Table({
  tableName: "CommentResponseSettings",
  timestamps: true
})
class CommentResponseSettings extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_comment_response_settings_company")
  @Column(DataType.INTEGER)
  companyId: number;

  @ForeignKey(() => Whatsapp)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  whatsappId: number;

  @ForeignKey(() => UGCSocialPost)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  socialPostId: number | null;

  @Default("manual")
  @Column(DataType.STRING(20))
  mode: ResponseMode;

  @AllowNull(true)
  @Column(DataType.TEXT)
  autoMessage: string | null;

  @ForeignKey(() => AIAgentConfig)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  aiAgentConfigId: number | null;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @BelongsTo(() => UGCSocialPost)
  socialPost: UGCSocialPost;

  @BelongsTo(() => AIAgentConfig)
  aiAgentConfig: AIAgentConfig;
}

export default CommentResponseSettings;
export { ResponseMode };
