import { Model, Table, Column, PrimaryKey, AutoIncrement,DataType, CreatedAt, UpdatedAt } from 'sequelize-typescript';

@Table({
  tableName: "Webhooks"
})
export class WebhookModel extends Model<WebhookModel> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column(DataType.INTEGER)
  user_id: number;

  @Column(DataType.STRING)
  hash_id: string;

  @Column(DataType.INTEGER)
  company_id: number;

  @Column(DataType.STRING)
  name: string;

  @Column(DataType.BOOLEAN)
  active: boolean;

  @Column(DataType.INTEGER)
  requestMonth: number;

  @Column(DataType.INTEGER)
  requestAll: number;

  @Column(DataType.JSON)
  config: {} | null;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}