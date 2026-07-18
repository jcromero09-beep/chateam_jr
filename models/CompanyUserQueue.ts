import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";
import CompanyUser from "./CompanyUser";
import Queue from "./Queue";

/**
 * [Multi-empresa · F4.2] Colas asignadas a una MEMBRESÍA (CompanyUsers). Permite
 * que un usuario vea colas distintas por empresa. Para admin/super la asignación
 * se ignora (ven todas las colas de la empresa activa).
 */
@Table({ tableName: "CompanyUserQueues" })
class CompanyUserQueue extends Model<CompanyUserQueue> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => CompanyUser)
  @Column({ type: DataType.BIGINT, allowNull: false })
  companyUserId!: number;

  @BelongsTo(() => CompanyUser)
  companyUser!: CompanyUser;

  @ForeignKey(() => Queue)
  @Column({ type: DataType.INTEGER, allowNull: false })
  queueId!: number;

  @BelongsTo(() => Queue)
  queue!: Queue;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;
}

export default CompanyUserQueue;
