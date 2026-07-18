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
  Default
  ,
  DataType
} from "sequelize-typescript";

@Table
class Plan extends Model<Plan> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @AllowNull(false)
  @Unique
  @Column(DataType.STRING)
  name: string;

  @Column(DataType.INTEGER)
  users: number;

  @Column(DataType.INTEGER)
  connections: number;

  @Column(DataType.INTEGER)
  queues: number;

  @Column(DataType.STRING)
  amount: string;

  @Column(DataType.BOOLEAN)
  useWhatsapp: boolean;

  @Column(DataType.BOOLEAN)
  useFacebook: boolean;

  @Column(DataType.BOOLEAN)
  useInstagram: boolean;

  @Column(DataType.BOOLEAN)
  useCampaigns: boolean;

  @Column(DataType.BOOLEAN)
  useSchedules: boolean;

  @Column(DataType.BOOLEAN)
  useInternalChat: boolean;

  @Column(DataType.BOOLEAN)
  useExternalApi: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @Column(DataType.BOOLEAN)
  useKanban: boolean;

  @Column(DataType.BOOLEAN)
  trial: boolean;

  @Column(DataType.INTEGER)
  trialDays: number;

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

  @Default(false)
  @Column(DataType.BOOLEAN)
  allowRecurringPayments: boolean;

  @Default(true)
  @Column(DataType.BOOLEAN)
  useOpenAi: boolean;

  @Default(true)
  @Column(DataType.BOOLEAN)
  useIntegrations: boolean;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isPublic: boolean;

  @Default(true)
  @Column(DataType.BOOLEAN)
  useMarketing: boolean;

  @Default(true)
  @Column(DataType.BOOLEAN)
  useLeads: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  useUgc: boolean;

  // ========== Email Marketing Feature Gating ==========

  @Default(false)
  @Column(DataType.BOOLEAN)
  useEmailMarketing: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  useEmailAutomation: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  useEmailAbTesting: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  useEmailAiOptimization: boolean;

  @Default(0)
  @Column(DataType.INTEGER)
  maxEmailCampaignsPerMonth: number;

  @Default(0)
  @Column(DataType.INTEGER)
  maxEmailContactLists: number;

  @Default(0)
  @Column(DataType.INTEGER)
  maxEmailContactsPerList: number;

  @Default(0)
  @Column(DataType.INTEGER)
  maxEmailSendsPerDay: number;

  @AllowNull(true)
  @Column(DataType.TEXT)
  interfacePermissions: string;
}

export default Plan;
