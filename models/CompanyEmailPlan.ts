import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  Default,
  DataType
} from "sequelize-typescript";
import Company from "./Company";
import EmailPlan from "./EmailPlan";

@Table({
  tableName: "CompanyEmailPlans",
  timestamps: true
})
class CompanyEmailPlan extends Model<CompanyEmailPlan> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  companyId: number;

  @ForeignKey(() => EmailPlan)
  @Column({
    type: DataType.INTEGER,
    allowNull: false
  })
  emailPlanId: number;

  @Default(0)
  @Column(DataType.INTEGER)
  emailCreditsUsed: number;

  @Column(DataType.INTEGER)
  emailCreditsTotal: number;

  @Column(DataType.DATE)
  emailCreditsResetAt: Date;

  @Column(DataType.DATE)
  dueDate: Date;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  // Relaciones
  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => EmailPlan)
  emailPlan: EmailPlan;

  // Virtual getter for remaining credits
  get remainingCredits(): number {
    return (this.emailCreditsTotal || 0) - (this.emailCreditsUsed || 0);
  }
}

export default CompanyEmailPlan;
