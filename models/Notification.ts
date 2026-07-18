import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  Default,
  DataType
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";

export type NotificationType = "info" | "success" | "warning" | "error";
export type NotificationCategory =
  | "system"
  | "appointment"
  | "campaign"
  | "ticket"
  | "user"
  | "message";

@Table({ tableName: "Notifications" })
class Notification extends Model<Notification> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  // Destinatario
  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @Default("info")
  @Column(DataType.STRING(20))
  type: NotificationType;

  @Default("system")
  @Column(DataType.STRING(30))
  category: NotificationCategory;

  @Column(DataType.STRING(255))
  title: string;

  @Column(DataType.TEXT)
  message: string;

  @Column(DataType.STRING(500))
  actionUrl: string;

  @Column(DataType.JSONB)
  metadata: Record<string, any>;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isRead: boolean;

  @Column(DataType.DATE)
  readAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Notification;
