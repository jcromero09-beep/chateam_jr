import { Table, Column, Model, DataType, PrimaryKey, AutoIncrement, CreatedAt } from "sequelize-typescript";
// [Fase2·N5] Auditoría persistente de llamadas a Meta (antes solo in-memory, se perdía al reiniciar).
@Table({ tableName: "meta_audit_logs", timestamps: false })
class MetaAuditLog extends Model<MetaAuditLog> {
  @PrimaryKey @AutoIncrement @Column(DataType.BIGINT) id!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) companyId!: number;
  @Column({ type: DataType.INTEGER }) userId!: number;
  @Column({ type: DataType.STRING(60), allowNull: false }) action!: string;
  @Column({ type: DataType.STRING(255) }) endpoint!: string;
  @Column({ type: DataType.STRING(10) }) method!: string;
  @Column({ type: DataType.STRING(20) }) responseStatus!: string;
  @Column({ type: DataType.INTEGER }) responseTime!: number;
  @Column({ type: DataType.STRING(30) }) errorCode!: string;
  @Column({ type: DataType.TEXT }) errorMessage!: string;
  @Column({ type: DataType.BOOLEAN }) cacheHit!: boolean;
  @CreatedAt createdAt!: Date;
}
export default MetaAuditLog;
