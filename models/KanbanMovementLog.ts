import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  DataType,
  Default,
} from "sequelize-typescript";
import Ticket from "./Ticket";
import Company from "./Company";
import Tag from "./Tag";
import User from "./User";

@Table({
  tableName: "KanbanMovementLogs",
  timestamps: false,
})
class KanbanMovementLog extends Model<KanbanMovementLog> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Ticket)
  @Column(DataType.INTEGER)
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => Tag)
  @Column(DataType.INTEGER)
  fromTagId: number;

  @BelongsTo(() => Tag, "fromTagId")
  fromTag: Tag;

  @Column(DataType.INTEGER)
  toTagId: number;

  @Default("system")
  @Column(DataType.STRING(10))
  movedBy: "system" | "user" | "ai";

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @Column(DataType.STRING(255))
  reason: string;

  @Column(DataType.JSONB)
  metadata: Record<string, any>;

  @Column(DataType.DECIMAL(5, 4))
  aiConfidence: number;

  @Column(DataType.STRING(100))
  aiModelUsed: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  wasOverriddenByUser: boolean;

  @CreatedAt
  createdAt: Date;
}

export default KanbanMovementLog;
