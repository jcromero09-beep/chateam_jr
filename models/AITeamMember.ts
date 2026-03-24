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
import AITeam from "./AITeam";

@Table({
  tableName: "AITeamMembers",
  timestamps: false
})
class AITeamMember extends Model<AITeamMember> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => AITeam)
  @Index
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  teamId!: number;

  @Index
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  userId!: number;

  @Default('agent')
  @Column(DataType.STRING(20))
  role!: string; // 'admin' | 'agent' | 'viewer'

  @Default(false)
  @Column(DataType.BOOLEAN)
  unlimitedCredits!: boolean;

  @Default({})
  @Column(DataType.JSONB)
  individualCredits!: Record<string, number>;

  @Default({})
  @Column(DataType.JSONB)
  usedCredits!: Record<string, number>;

  @Column(DataType.DATE)
  joinedAt!: Date;

  @BelongsTo(() => AITeam)
  team!: AITeam;
}

export default AITeamMember;
