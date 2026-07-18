import { Table, Column, Model, DataType, PrimaryKey, AutoIncrement, CreatedAt, UpdatedAt } from "sequelize-typescript";
// [Fase2·Ola H · H.1] Categorías sensibles configurables por empresa.
@Table({ tableName: "sensitive_categories", timestamps: true })
class SensitiveCategory extends Model<SensitiveCategory> {
  @PrimaryKey @AutoIncrement @Column(DataType.INTEGER) id!: number;
  @Column({ type: DataType.INTEGER, allowNull: false }) companyId!: number;
  @Column({ type: DataType.STRING(60), allowNull: false }) key!: string;
  @Column({ type: DataType.STRING(120), allowNull: false }) label!: string;
  @Column({ type: DataType.TEXT }) description!: string;
  @Column({ type: DataType.JSONB }) keywords!: string[];
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true }) requiresHuman!: boolean;
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true }) active!: boolean;
  @CreatedAt createdAt!: Date;
  @UpdatedAt updatedAt!: Date;
}
export default SensitiveCategory;
