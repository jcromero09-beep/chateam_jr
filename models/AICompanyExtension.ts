import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  ForeignKey,
  BelongsTo,
  Default,
  Index
} from "sequelize-typescript";
import Company from "./Company";
import AIExtension from "./AIExtension";

@Table({
  tableName: "AICompanyExtensions",
  timestamps: false
})
class AICompanyExtension extends Model<AICompanyExtension> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @Index
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  companyId!: number;

  @ForeignKey(() => AIExtension)
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  extensionId!: number;

  @Default(false)
  @Column(DataType.BOOLEAN)
  installed!: boolean;

  @Default({})
  @Column(DataType.JSONB)
  configOverride!: Record<string, unknown>;

  @Column(DataType.DATE)
  installedAt!: Date;

  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => AIExtension)
  extension!: AIExtension;
}

export default AICompanyExtension;
