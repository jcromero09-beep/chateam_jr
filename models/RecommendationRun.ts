import {
  Table, Column, Model, DataType, PrimaryKey, AutoIncrement, CreatedAt, UpdatedAt
} from "sequelize-typescript";

// [Fase2·Ola D · G0] Auditoría de recomendaciones del motor estadístico.
@Table({ tableName: "recommendation_runs", timestamps: true })
class RecommendationRun extends Model<RecommendationRun> {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) id!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) companyId!: number;
  @Column({ type: DataType.DATEONLY, allowNull: false }) runDate!: string;
  @Column({ type: DataType.STRING(40), allowNull: false }) kind!: string;
  @Column({ type: DataType.STRING(60), allowNull: false }) method!: string;
  @Column({ type: DataType.STRING(30), allowNull: true }) targetType!: string;
  @Column({ type: DataType.STRING(60), allowNull: true }) targetId!: string;
  @Column({ type: DataType.TEXT, allowNull: false }) recommendation!: string;
  @Column({ type: DataType.JSONB, allowNull: true }) metrics!: object;
  @Column({ type: DataType.TEXT, allowNull: true }) assumption!: string;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true }) sufficientData!: boolean;
  @Column({ type: DataType.STRING(20), allowNull: false, defaultValue: "pending" }) status!: string;
  @Column({ type: DataType.STRING(20), allowNull: true }) outcome!: string;
  @Column({ type: DataType.DATE, allowNull: true }) appliedAt!: Date;
  @CreatedAt createdAt!: Date;
  @UpdatedAt updatedAt!: Date;
}

export default RecommendationRun;
