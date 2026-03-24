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
  DataType,
  HasMany
} from "sequelize-typescript";
import Contact from "./Contact";
import Message from "./Message";

import Plan from "./Plan";
import AISubplan from "./AISubplan";
import EmailPlan from "./EmailPlan";
import Queue from "./Queue";
import Setting from "./Setting";
import Ticket from "./Ticket";
import TicketTraking from "./TicketTraking";
import User from "./User";
import UserRating from "./UserRating";
import Whatsapp from "./Whatsapp";
import CompaniesSettings from "./CompaniesSettings";
import Invoices from "./Invoices";

@Table
class Company extends Model<Company> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @Column(DataType.STRING)
  name: string;

  @Column(DataType.STRING)
  phone: string;

  @Column(DataType.STRING)
  email: string;

  @Column({ type: DataType.STRING, defaultValue: "" })
  document: string;

  @Column({ type: DataType.STRING, defaultValue: "" })
  paymentMethod: string;

  @Column(DataType.DATE)
  lastLogin: Date;

  @Column(DataType.BOOLEAN)
  status: boolean;

  @Column(DataType.STRING)
  dueDate: string;

  @Column(DataType.STRING)
  recurrence: string;

  @Column(DataType.TEXT)
  facebookAppId: string;

  @Column(DataType.TEXT)
  facebookAppSecret: string;

  @Column(DataType.TEXT)
  paypalClientId: string;

  @Column(DataType.TEXT)
  paypalSecretKey: string;

  @Column(DataType.TEXT)
  stripePublicKey: string;

  @Column(DataType.TEXT)
  stripeSecretKey: string;

  @Column({
    type: DataType.JSONB
  })
  schedules: any[];

  @ForeignKey(() => Plan)
  @Column(DataType.INTEGER)
  planId: number;

  @Column(DataType.STRING)
  planDetail: string;

  @BelongsTo(() => Plan)
  plan: Plan;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @Column(DataType.STRING)
  folderSize: string;

  @Column(DataType.STRING)
  numberFileFolder: string;

  @Column(DataType.STRING)
  updatedAtFolder: string;

  // ============================================================================
  // Campo de Referido (Afiliados MLM)
  // ============================================================================

  @Column({ type: DataType.STRING(50), allowNull: true })
  referredByCode: string;

  // ============================================================================
  // Campos para Generación de Imágenes con IA
  // ============================================================================

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  imageGenerationCredits: number;

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  totalImageGenerationCreditsUsed: number;

  // ============================================================================
  // Campos para AI Token Balance y Subplan Activo
  // ============================================================================

  @Column({ type: DataType.BIGINT, defaultValue: 0 })
  aiTokenBalance: number;

  // Tokens comprados manualmente (adicionales al plan)
  @Column({ type: DataType.BIGINT, defaultValue: 0 })
  aiTokensPurchased: number;

  @ForeignKey(() => AISubplan)
  @Column({ type: DataType.INTEGER, allowNull: true })
  activeAISubplanId: number;

  @BelongsTo(() => AISubplan)
  activeAISubplan: AISubplan;

  // ============================================================================
  // Campos para Email Plan Activo
  // ============================================================================

  @Column({ type: DataType.BIGINT, defaultValue: 0 })
  emailCreditsTotal: number;

  @ForeignKey(() => EmailPlan)
  @Column({ type: DataType.INTEGER, allowNull: true })
  activeEmailPlanId: number;

  @BelongsTo(() => EmailPlan)
  activeEmailPlan: EmailPlan;

  @HasMany(() => User, {
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
    hooks: true
  })
  users: User[];

  @HasMany(() => UserRating, {
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
    hooks: true
  })
  userRatings: UserRating[];

  @HasMany(() => Queue, {
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
    hooks: true
  })
  queues: Queue[];

  @HasMany(() => Whatsapp, {
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
    hooks: true
  })
  whatsapps: Whatsapp[];

  @HasMany(() => Message, {
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
    hooks: true
  })
  messages: Message[];

  @HasMany(() => Contact, {
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
    hooks: true
  })
  contacts: Contact[];

  @HasMany(() => Setting, {
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
    hooks: true
  })
  settings: Setting[];

  @HasMany(() => CompaniesSettings, {
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
    hooks: true
  })
  companieSettings: CompaniesSettings;

  @HasMany(() => Ticket, {
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
    hooks: true
  })
  tickets: Ticket[];

  @HasMany(() => TicketTraking, {
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
    hooks: true
  })
  ticketTrankins: TicketTraking[];

  @HasMany(() => Invoices, {
    onUpdate: "CASCADE",
    onDelete: "CASCADE",
    hooks: true
  })
  invoices: Invoices[];
}

export default Company;
