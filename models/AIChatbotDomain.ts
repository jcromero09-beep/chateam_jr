import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  DataType,
  Default,
  CreatedAt
} from "sequelize-typescript";
import AIChatbotConfig from "./AIChatbotConfig";
import Company from "./Company";

@Table({ tableName: "AIChatbotDomains", timestamps: false })
class AIChatbotDomain extends Model<AIChatbotDomain> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Default(DataType.UUIDV4)
  @Column(DataType.STRING(36))
  uuid: string;

  @ForeignKey(() => AIChatbotConfig)
  @Column(DataType.INTEGER)
  chatbotId: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @Column(DataType.STRING(255))
  domain: string;

  @Column(DataType.STRING(64))
  appKey: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  sslEnabled: boolean;

  @Column(DataType.TEXT)
  customCss: string;

  @Column(DataType.TEXT)
  customJs: string;

  @Default(["*"])
  @Column(DataType.JSONB)
  allowedOrigins: string[];

  @Default("pending_dns")
  @Column(DataType.STRING(20))
  status: "pending_dns" | "active" | "suspended";

  @CreatedAt
  createdAt: Date;

  @BelongsTo(() => AIChatbotConfig)
  chatbot: AIChatbotConfig;

  @BelongsTo(() => Company)
  company: Company;
}

export default AIChatbotDomain;
