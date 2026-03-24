import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Unique,
  Default,
  DataType,
  HasMany
} from "sequelize-typescript";
import CompanyEmailPlan from "./CompanyEmailPlan";

@Table({
  tableName: "EmailPlans",
  timestamps: true
})
class EmailPlan extends Model<EmailPlan> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING)
  name: string;

  @Column(DataType.TEXT)
  description: string;

  @Default(100)
  @Column(DataType.INTEGER)
  emailCreditsPerCycle: number;

  @Default(50)
  @Column(DataType.INTEGER)
  maxEmailSendsPerDay: number;

  @Default(10)
  @Column(DataType.INTEGER)
  maxTemplates: number;

  @AllowNull(false)
  @Column(DataType.DECIMAL(10, 2))
  price: string;

  @Default("MENSUAL")
  @Column(DataType.STRING)
  recurrence: string;

  @Column(DataType.STRING)
  stripePriceId: string;

  @Column(DataType.STRING)
  stripeProductId: string;

  @Column(DataType.STRING)
  paypalProductId: string;

  @Column(DataType.STRING)
  paypalPlanId: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isPublic: boolean;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  // Relaciones
  @HasMany(() => CompanyEmailPlan)
  companyEmailPlans: CompanyEmailPlan[];
}

export default EmailPlan;
