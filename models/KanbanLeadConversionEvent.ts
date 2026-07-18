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
  Index
} from "sequelize-typescript";
import Company from "./Company";
import Ticket from "./Ticket";
import Contact from "./Contact";
import Tag from "./Tag";
import User from "./User";

/**
 * KanbanLeadConversionEvent
 *
 * Registro 1:1 de cada intento (o skip) de envío de evento `Lead` a
 * Meta CAPI cuando una etiqueta Kanban es asignada a un ticket
 * (manualmente desde el board o automáticamente vía clasificador IA).
 *
 * No reemplaza ni modifica `FacebookConversionEvents` (Purchase y otros
 * eventos legacy se mantienen intactos). Esta tabla es exclusiva del
 * flujo Lead-por-Kanban.
 *
 * Estados:
 *  - pending  → registro creado, aún no se contactó Meta
 *  - sent     → request HTTP completado (sin marcar success aún)
 *  - success  → Meta respondió 2xx + events_received > 0
 *  - failed   → error HTTP / Meta respondió error
 *  - skipped  → no se intentó enviar (sin contacto, duplicado, etc.)
 */
@Table({ tableName: "KanbanLeadConversionEvents" })
class KanbanLeadConversionEvent extends Model<KanbanLeadConversionEvent> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  // ─── Tenant / dueños ──────────────────────────────────────────────
  @Index
  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Index
  @ForeignKey(() => Ticket)
  @Column(DataType.INTEGER)
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @Index
  @ForeignKey(() => Contact)
  @Column(DataType.INTEGER)
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @Index
  @ForeignKey(() => Tag)
  @Column(DataType.INTEGER)
  kanbanTagId: number;

  @BelongsTo(() => Tag)
  kanbanTag: Tag;

  // ─── Snapshot Kanban (para resistir cambios futuros) ─────────────
  @Index
  @Column(DataType.STRING)
  kanbanKey: string;

  @Column(DataType.STRING)
  kanbanTagName: string;

  // ─── Evento ──────────────────────────────────────────────────────
  @Index
  @Column({ type: DataType.STRING, defaultValue: "Lead" })
  eventName: string;

  @Column(DataType.STRING)
  eventId: string;

  @Column({ type: DataType.STRING, defaultValue: "kanban_label" })
  source: string;

  // ─── Destino resuelto (Pixel/Dataset Meta) ───────────────────────
  @Column(DataType.STRING)
  destinationId: string;

  @Column(DataType.STRING)
  destinationSource: string;

  // ─── Resultado / telemetría Meta ─────────────────────────────────
  @Index
  @Column({
    type: DataType.ENUM("pending", "sent", "success", "failed", "skipped"),
    defaultValue: "pending"
  })
  responseStatus: string;

  @Column(DataType.STRING)
  fbtraceId: string;

  @Column(DataType.TEXT)
  errorMessage: string;

  @Column(DataType.JSON)
  userData: object;

  @Column(DataType.JSON)
  customData: object;

  @Column(DataType.JSON)
  fbResponse: object;

  @Column(DataType.DATE)
  sentAt: Date;

  // ─── Trazabilidad opcional ───────────────────────────────────────
  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @Index
  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default KanbanLeadConversionEvent;
