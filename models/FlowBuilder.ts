import {
  Model,
  Table,
  Column,
  PrimaryKey,
  AutoIncrement,
  DataType,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";

@Table({
  tableName: "FlowBuilders"
})
export class FlowBuilderModel extends Model<FlowBuilderModel> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column({ type: DataType.INTEGER, field: 'userId' })
  user_id: number;

  @Column(DataType.STRING)
  name: string;

  @Column({ type: DataType.INTEGER, field: 'companyId' })
  company_id: number;

  @Column(DataType.BOOLEAN)
  active: boolean;

  @Column(DataType.JSON)
  flow: {} | null;

  @Column(DataType.JSON)
  variables: {} | null;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}
