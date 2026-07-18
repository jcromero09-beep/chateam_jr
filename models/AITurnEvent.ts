import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  Index
} from "sequelize-typescript";
import Company from "./Company";

@Table({ tableName: "AITurnEvents" })
class AITurnEvent extends Model<AITurnEvent> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @AllowNull(false)
  @Index
  @Column(DataType.STRING(64))
  turnId!: string;

  @AllowNull(false)
  @ForeignKey(() => Company)
  @Index
  @Column(DataType.INTEGER)
  companyId!: number;

  @BelongsTo(() => Company)
  company!: Company;

  @AllowNull(true)
  @Index
  @Column(DataType.INTEGER)
  ticketId!: number | null;

  @AllowNull(true)
  @Index
  @Column(DataType.INTEGER)
  contactId!: number | null;

  @AllowNull(true)
  @Index
  @Column(DataType.INTEGER)
  whatsappId!: number | null;

  @AllowNull(true)
  @Index
  @Column(DataType.INTEGER)
  messageId!: number | null;

  @AllowNull(true)
  @Column(DataType.STRING(40))
  channel!: string | null;

  @AllowNull(false)
  @Index
  @Column(DataType.STRING(80))
  eventType!: string;

  @AllowNull(false)
  @Default("ok")
  @Index
  @Column(DataType.STRING(30))
  eventStatus!: string;

  @AllowNull(true)
  @Column(DataType.STRING(255))
  reason!: string | null;

  @AllowNull(false)
  @Default({})
  @Column(DataType.JSONB)
  metadata!: Record<string, unknown>;

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  inputTokens!: number;

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  outputTokens!: number;

  @AllowNull(false)
  @Default(0)
  @Column(DataType.INTEGER)
  totalTokens!: number;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;
}

export default AITurnEvent;
