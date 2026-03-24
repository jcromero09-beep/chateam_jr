import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  Default,
  Index
} from "sequelize-typescript";
import Company from "./Company";

@Table({
  tableName: "AIEmailTemplates",
  timestamps: true
})
class AIEmailTemplate extends Model<AIEmailTemplate> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @Index
  @Column(DataType.INTEGER)
  companyId!: number; // null = sistema

  @Default('system')
  @Index
  @Column(DataType.STRING(20))
  type!: string; // 'system' | 'custom' | 'ai_generated'

  @Index
  @Column({
    type: DataType.STRING(100),
    allowNull: false
  })
  slug!: string;

  @Column({
    type: DataType.STRING(500),
    allowNull: false
  })
  subject!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false
  })
  body!: string; // HTML con variables {user_name}, etc.

  @Default([])
  @Column(DataType.ARRAY(DataType.TEXT))
  variables!: string[];

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive!: boolean;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  @BelongsTo(() => Company)
  company!: Company;
}

export default AIEmailTemplate;
