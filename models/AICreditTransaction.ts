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
} from "sequelize-typescript";
import Company from "./Company";
import AICreditType from "./AICreditType";
import User from "./User";

@Table({
  tableName: "AICreditTransactions",
  timestamps: false,
})
class AICreditTransaction extends Model<AICreditTransaction> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => AICreditType)
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  creditTypeId: number;

  @BelongsTo(() => AICreditType)
  creditType: AICreditType;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  amount: number;

  @Default("debit")
  @Column(DataType.STRING(10))
  direction: "debit" | "credit";

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  balanceBefore: number;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  balanceAfter: number;

  @Column({
    type: DataType.STRING(50),
    allowNull: false,
  })
  source: string;

  @Column(DataType.STRING(255))
  sourceId: string;

  // Tokens reales consumidos (ej: tokens de OpenAI)
  @Column({ type: DataType.BIGINT, allowNull: true })
  tokensUsed: number;

  // Costo real en USD (calculado basado en pricing de OpenAI)
  @Column({ type: DataType.DECIMAL(12, 6), allowNull: true })
  realCostUsd: number;

  @Column(DataType.TEXT)
  description: string;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @CreatedAt
  createdAt: Date;
}

export default AICreditTransaction;
