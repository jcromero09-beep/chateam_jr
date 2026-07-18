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
  Default
} from "sequelize-typescript";
import Company from "./Company";

interface KeywordRule {
  keywords: string[];
  publicReply: string | null;
  privateReply: string | null;
  imageUrl?: string;
  videoUrl?: string;
}

@Table({
  tableName: "CommentAutoReplyCampaigns",
  timestamps: true
})
class CommentAutoReplyCampaign extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @Column({ type: DataType.STRING(255), allowNull: false })
  name: string;

  @Default("post")
  @Column(DataType.STRING(20))
  campaignType: "post" | "page" | "all";

  @Default("facebook")
  @Column(DataType.STRING(20))
  platform: "facebook" | "instagram";

  @Column(DataType.STRING(255))
  pageId: string;

  @Column(DataType.STRING(255))
  pageName: string;

  @Column(DataType.TEXT)
  pageAccessToken: string;

  @Column(DataType.STRING(255))
  postId: string;

  @Column(DataType.STRING(1024))
  postPermalink: string;

  @Column(DataType.TEXT)
  postDescription: string;

  @Column(DataType.STRING(1024))
  postThumbnail: string;

  @Default("keyword")
  @Column(DataType.STRING(20))
  replyMode: "keyword" | "ai" | "generic" | "template";

  @Default("contains")
  @Column(DataType.STRING(10))
  triggerMatchingType: "exact" | "contains";

  @Default([])
  @Column(DataType.JSONB)
  keywordRules: KeywordRule[];

  @Column(DataType.TEXT)
  defaultPublicReply: string;

  @Column(DataType.TEXT)
  defaultPrivateReply: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  aiEnabled: boolean;

  @Column(DataType.TEXT)
  aiTrainingData: string;

  @Column(DataType.INTEGER)
  aiAgentIdentityId: number;

  @Default(false)
  @Column(DataType.BOOLEAN)
  autoLikeComment: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  hideCommentAfterReply: boolean;

  @Default(true)
  @Column(DataType.BOOLEAN)
  sendPrivateReply: boolean;

  @Default(true)
  @Column(DataType.BOOLEAN)
  sendPublicReply: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  offensiveWordsEnabled: boolean;

  @Column(DataType.TEXT)
  offensiveWords: string;

  @Default("hide")
  @Column(DataType.STRING(10))
  offensiveAction: "hide" | "delete" | "block";

  @Column(DataType.TEXT)
  offensivePrivateMessage: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  multipleReply: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  delayEnabled: boolean;

  @Default(5)
  @Column(DataType.INTEGER)
  delayMinSeconds: number;

  @Default(30)
  @Column(DataType.INTEGER)
  delayMaxSeconds: number;

  @Default("active")
  @Column(DataType.STRING(20))
  status: "active" | "paused" | "draft" | "deleted";

  @Default(0)
  @Column(DataType.INTEGER)
  totalRepliesSent: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalPrivateRepliesSent: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalCommentsHidden: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalCommentsDeleted: number;

  @Default(0)
  @Column(DataType.INTEGER)
  totalLikesGiven: number;

  @Column(DataType.DATE)
  lastReplyAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsTo(() => Company)
  company: Company;
}

export default CommentAutoReplyCampaign;
export { KeywordRule };
