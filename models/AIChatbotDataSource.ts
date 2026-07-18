import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  Default,
  Index
} from "sequelize-typescript";
import Company from "./Company";
import AIChatbotConfig from "./AIChatbotConfig";

@Table({
  tableName: "AIChatbotDataSources",
  timestamps: false
})
class AIChatbotDataSource extends Model<AIChatbotDataSource> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => AIChatbotConfig)
  @Index
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  chatbotId!: number;

  @ForeignKey(() => Company)
  @Index
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  companyId!: number;

  @Column({
    type: DataType.STRING(30),
    allowNull: false
  })
  type!: string; // 'text' | 'file' | 'url' | 'qa_pairs' | 'ticket_history'

  @Column(DataType.TEXT)
  content!: string;

  @Column(DataType.TEXT)
  fileUrl!: string;

  @Column(DataType.TEXT)
  sourceUrl!: string;

  @Default('pending')
  @Column(DataType.STRING(20))
  status!: string; // 'pending' | 'processing' | 'processed' | 'error'

  @Default(0)
  @Column(DataType.INTEGER)
  chunksCount!: number;

  @Default(0)
  @Column(DataType.INTEGER)
  tokensCount!: number;

  @Column(DataType.TEXT)
  errorMessage!: string;

  @Column(DataType.DATE)
  processedAt!: Date;

  @CreatedAt
  createdAt!: Date;

  @BelongsTo(() => AIChatbotConfig)
  chatbot!: AIChatbotConfig;

  @BelongsTo(() => Company)
  company!: Company;
}

export default AIChatbotDataSource;
