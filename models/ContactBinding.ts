/**
 * ContactBinding — FASE 3 Coexistencia WhatsApp.
 *
 * Une un Contact físico (1 por conexión WhatsApp) a una
 * UnifiedConversation lógica. Permite que un mismo número tenga
 * N bindings (1 por proveedor: meta, baileys, etc.) pero siga
 * siendo UNA conversación.
 */
import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt
} from "sequelize-typescript";
import Company from "./Company";
import Contact from "./Contact";
import Whatsapp from "./Whatsapp";
import UnifiedConversation from "./UnifiedConversation";

@Table({ tableName: "ContactBindings" })
class ContactBinding extends Model<ContactBinding> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @AllowNull(false)
  @ForeignKey(() => UnifiedConversation)
  @Column(DataType.UUID)
  conversationId: string;

  @BelongsTo(() => UnifiedConversation)
  conversation: UnifiedConversation;

  @AllowNull(false)
  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @AllowNull(false)
  @ForeignKey(() => Contact)
  @Column(DataType.INTEGER)
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @AllowNull(true)
  @ForeignKey(() => Whatsapp)
  @Column(DataType.INTEGER)
  whatsappId: number | null;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @AllowNull(false)
  @Column(DataType.STRING(32))
  provider: string;

  @AllowNull(false)
  @Column(DataType.STRING(255))
  providerIdentifier: string;

  @Default(true)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  isActive: boolean;

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  firstSeenAt: Date;

  @AllowNull(true)
  @Column(DataType.DATE)
  lastSeenAt: Date | null;

  @AllowNull(true)
  @Default({})
  @Column(DataType.JSONB)
  metadata: Record<string, any> | null;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default ContactBinding;
