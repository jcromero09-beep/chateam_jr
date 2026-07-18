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
  Default
} from "sequelize-typescript";
import Plan from "./Plan";
import AICreditType from "./AICreditType";

@Table({
  tableName: "PlanCreditAllocations",
  timestamps: true
})
class PlanCreditAllocation extends Model<PlanCreditAllocation> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Plan)
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  planId!: number;

  @ForeignKey(() => AICreditType)
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  creditTypeId!: number;

  @Default(0)
  @Column(DataType.DECIMAL(15, 4))
  creditsPerCycle!: number;

  @Default(false)
  @Column(DataType.BOOLEAN)
  isUnlimited!: boolean;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  // Relaciones
  @BelongsTo(() => Plan)
  plan!: Plan;

  @BelongsTo(() => AICreditType)
  creditType!: AICreditType;
}

export default PlanCreditAllocation;
