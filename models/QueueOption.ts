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
  AllowNull
,
  DataType
} from "sequelize-typescript";
import Queue from "./Queue";

@Table
class QueueOption extends Model<QueueOption> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column(DataType.STRING)
  title: string;

  @AllowNull
  @Column(DataType.STRING)
  message: string;

  @AllowNull
  @Column(DataType.STRING)
  option: string;

  @ForeignKey(() => Queue)
  @Column(DataType.INTEGER)
  queueId: number;

  @ForeignKey(() => QueueOption)
  @Column(DataType.INTEGER)
  parentId: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsTo(() => Queue)
  queue: Queue;

  @BelongsTo(() => QueueOption, { foreignKey: 'parentId' })
  parent: QueueOption;
}

export default QueueOption;
