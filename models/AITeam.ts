import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  ForeignKey,
  BelongsTo,
  HasMany,
  CreatedAt,
  UpdatedAt,
  Default,
  Index
} from "sequelize-typescript";
import Company from "./Company";

@Table({
  tableName: "AITeams",
  timestamps: true
})
class AITeam extends Model<AITeam> {
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

  @Column({
    type: DataType.STRING(255),
    allowNull: false
  })
  name!: string;

  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  managerId!: number;

  @Default(5)
  @Column(DataType.INTEGER)
  maxSeats!: number;

  @Default([])
  @Column(DataType.JSONB)
  aiModelsAllowed!: string[];

  @Default([])
  @Column(DataType.JSONB)
  features!: string[];

  @Default({})
  @Column(DataType.JSONB)
  sharedCredits!: Record<string, number>;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive!: boolean;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  @BelongsTo(() => Company)
  company!: Company;

  @HasMany(() => require("./AITeamMember").default)
  members!: any[];
}

export default AITeam;
