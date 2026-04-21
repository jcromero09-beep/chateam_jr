/**
 * UnifiedConversation — FASE 3 Coexistencia WhatsApp.
 *
 * Representa UNA conversación lógica con un cliente, independiente
 * del canal físico (Meta / Baileys / futuro). Un mismo número puede
 * tener N ContactBindings (1 por proveedor) pero UNA sola conversación.
 */
import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Default,
  AllowNull,
  ForeignKey,
  BelongsTo,
  HasMany,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";
import Company from "./Company";
import Contact from "./Contact";
import ContactBinding from "./ContactBinding";

@Table({ tableName: "UnifiedConversations" })
class UnifiedConversation extends Model<UnifiedConversation> {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @AllowNull(false)
  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  /**
   * Número normalizado (sólo dígitos, sin +).
   */
  @AllowNull(false)
  @Column(DataType.STRING(32))
  canonicalNumber: string;

  @AllowNull(true)
  @ForeignKey(() => Contact)
  @Column(DataType.INTEGER)
  primaryContactId: number | null;

  @BelongsTo(() => Contact, "primaryContactId")
  primaryContact: Contact;

  @HasMany(() => ContactBinding)
  bindings: ContactBinding[];

  /**
   * 'active' | 'archived'
   */
  @Default("active")
  @AllowNull(false)
  @Column(DataType.STRING(20))
  status: string;

  /**
   * Política de routing saliente:
   *   'auto' | 'force_meta' | 'force_baileys' | 'sticky_inbound'
   */
  @Default("auto")
  @AllowNull(false)
  @Column(DataType.STRING(20))
  routingPolicy: string;

  @AllowNull(true)
  @Column(DataType.STRING(20))
  currentChannel: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(20))
  lastInboundChannel: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(20))
  lastOutboundChannel: string | null;

  @AllowNull(true)
  @Column(DataType.DATE)
  lastInboundAt: Date | null;

  @AllowNull(true)
  @Column(DataType.DATE)
  lastOutboundAt: Date | null;

  @AllowNull(true)
  @Default({})
  @Column(DataType.JSONB)
  metadata: Record<string, any> | null;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default UnifiedConversation;
