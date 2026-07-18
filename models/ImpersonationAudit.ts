import { Table, Column, Model, DataType, PrimaryKey, AutoIncrement, CreatedAt } from "sequelize-typescript";
// [Super/Impersonación] Auditoría inmutable de entradas/salidas del super a una empresa.
@Table({ tableName: "impersonation_audits", timestamps: false })
class ImpersonationAudit extends Model<ImpersonationAudit> {
  @PrimaryKey @AutoIncrement @Column(DataType.BIGINT) id!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) superUserId!: number;
  @Column({ type: DataType.STRING(120) }) superName!: string;
  @Column({ type: DataType.INTEGER, allowNull: false }) companyId!: number;
  @Column({ type: DataType.STRING(160) }) companyName!: string;
  @Column({ type: DataType.STRING(12), allowNull: false }) action!: string;
  @Column({ type: DataType.STRING(60) }) ip!: string;
  @CreatedAt createdAt!: Date;
}
export default ImpersonationAudit;
