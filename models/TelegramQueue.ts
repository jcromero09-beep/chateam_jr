import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  ForeignKey,
  BelongsTo
,
  DataType
} from "sequelize-typescript";
import Queue from "./Queue";
import Telegram from "./Telegram";

@Table
class TelegramQueue extends Model<TelegramQueue> {
  @ForeignKey(() => Telegram)
  @Column(DataType.INTEGER)
  telegramId: number;

  @ForeignKey(() => Queue)
  @Column(DataType.INTEGER)
  queueId: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsTo(() => Telegram)
  telegram: Telegram;

  @BelongsTo(() => Queue)
  queue: Queue;
}

export default TelegramQueue;
