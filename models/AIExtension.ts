import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  CreatedAt,
  Default,
  Unique,
  HasMany
} from "sequelize-typescript";

@Table({
  tableName: "AIExtensions",
  timestamps: false
})
class AIExtension extends Model<AIExtension> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @Unique
  @Column({
    type: DataType.STRING(100),
    allowNull: false
  })
  slug!: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false
  })
  name!: string;

  @Column(DataType.TEXT)
  description!: string;

  @Default('1.0.0')
  @Column(DataType.STRING(20))
  version!: string;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isCore!: boolean; // No se puede desinstalar

  @Column(DataType.STRING(50))
  requiredPlan!: string; // Plan mínimo requerido

  @Default({})
  @Column(DataType.JSONB)
  config!: Record<string, unknown>;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive!: boolean;

  @CreatedAt
  createdAt!: Date;

  @HasMany(() => require("./AICompanyExtension").default)
  companyExtensions!: any[];
}

export default AIExtension;
