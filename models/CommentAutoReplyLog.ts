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
  Default
} from "sequelize-typescript";
import Company from "./Company";
import CommentAutoReplyCampaign from "./CommentAutoReplyCampaign";

@Table({
  tableName: "CommentAutoReplyLogs",
  timestamps: false
})
class CommentAutoReplyLog extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @ForeignKey(() => CommentAutoReplyCampaign)
  @Column(DataType.INTEGER)
  campaignId: number;

  @Column({ type: DataType.STRING(255), allowNull: false })
  platformCommentId: string;

  @Column(DataType.STRING(255))
  postId: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  commentText: string;

  @Column(DataType.STRING(255))
  commenterName: string;

  @Column(DataType.STRING(255))
  commenterId: string;

  @Column(DataType.STRING(1024))
  commenterProfileUrl: string;

  @Column(DataType.DATE)
  commentedAt: Date;

  @Column(DataType.TEXT)
  publicReplyText: string;

  @Column(DataType.STRING(255))
  publicReplyId: string;

  @Default("pending")
  @Column(DataType.STRING(20))
  publicReplyStatus: "pending" | "sent" | "failed" | "skipped";

  @Column(DataType.TEXT)
  privateReplyText: string;

  @Column(DataType.STRING(255))
  privateReplyId: string;

  @Default("pending")
  @Column(DataType.STRING(20))
  privateReplyStatus: "pending" | "sent" | "failed" | "skipped";

  @Default(false)
  @Column(DataType.BOOLEAN)
  wasLiked: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  wasHidden: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  wasDeleted: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  wasBlocked: boolean;

  @Column(DataType.STRING(255))
  matchedKeyword: string;

  @Default("keyword")
  @Column(DataType.STRING(20))
  replySource: "keyword" | "ai" | "default" | "offensive";

  @Column(DataType.STRING(50))
  aiClassification: string;

  @Column(DataType.STRING(20))
  aiSentiment: string;

  @Column(DataType.DECIMAL(3, 2))
  aiPurchaseIntentScore: number;

  @Column(DataType.TEXT)
  errorMessage: string;

  @Default(DataType.NOW)
  @Column(DataType.DATE)
  processedAt: Date;

  @Default(DataType.NOW)
  @Column(DataType.DATE)
  createdAt: Date;

  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => CommentAutoReplyCampaign)
  campaign: CommentAutoReplyCampaign;
}

export default CommentAutoReplyLog;
