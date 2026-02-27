import {
    Table,
    Column,
    CreatedAt,
    UpdatedAt,
    Model,
    PrimaryKey,
    AutoIncrement,
    ForeignKey,
    AllowNull,
    HasMany,
    Unique
,
  DataType
} from "sequelize-typescript";
import Company from "./Company";

@Table({ tableName: "Invoices" })
class Invoices extends Model<Invoices> {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
  id: number;

    @ForeignKey(() => Company)
    @Column(DataType.INTEGER)
  companyId: number;

    @Column(DataType.STRING)
  dueDate: string;

    @Column(DataType.STRING)
  detail: string;

    @Column(DataType.STRING)
  status: string;

    @Column(DataType.INTEGER)
  value: number;

    @Column(DataType.INTEGER)
  users: number;

    @Column(DataType.INTEGER)
  connections: number;

    @Column(DataType.INTEGER)
  queues: number;

    @Column(DataType.STRING)
  stripe_id: string;

    @Column(DataType.STRING)
  subscriptionId: string;

    @Column(DataType.STRING)
  customId: string;


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

    @Column(DataType.STRING)
  linkInvoice: string;

    @Column(DataType.INTEGER)
  planId: number;

    
    
    @Column(DataType.STRING)
  recurrence: string;

    // Payment method: 'stripe' | 'paypal' | 'outline' | 'pix' | 'apple'
    @AllowNull(true)
    @Column(DataType.STRING)
  paymentMethod: string;

    // PayPal Order ID for tracking
    @AllowNull(true)
    @Column(DataType.STRING)
  paypalOrderId: string;

    // Payment intent ID (Stripe or PayPal capture ID)
    @AllowNull(true)
    @Column(DataType.STRING)
  payment_intent: string;

    // Apple Transaction ID for App Store payments
    @AllowNull(true)
    @Column(DataType.STRING)
  appleTransactionId: string;

    // Apple Latest Transaction ID for renewals
    @AllowNull(true)
    @Column(DataType.STRING)
  appleLatestTransactionId: string;

    // Apple Product ID
    @AllowNull(true)
    @Column(DataType.STRING)
  appleProductId: string;

    // Apple Purchase Date
    @AllowNull(true)
    @Column(DataType.DATE)
  applePurchaseDate: Date;

    // Apple Expires Date
    @AllowNull(true)
    @Column(DataType.DATE)
  appleExpiresDate: Date;
}

export default Invoices;
