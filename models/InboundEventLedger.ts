/**
 * InboundEventLedger — FASE 2 Coexistencia WhatsApp.
 *
 * Registra cada evento inbound recibido de un proveedor (Meta, Baileys)
 * garantizando idempotencia vía UNIQUE(companyId, eventKey).
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

@Table({ tableName: "InboundEventLedger" })
class InboundEventLedger extends Model<InboundEventLedger> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id: number;

  @AllowNull(false)
  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  /**
   * Proveedor físico del evento.
   * Ver migración 20260421000001 para lista completa de valores.
   */
  @AllowNull(false)
  @Column(DataType.STRING(32))
  provider: string;

  /**
   * Clave única del evento dentro de (companyId).
   * Formato: `{providerType}:{providerMessageId}[:{sub-qualifier}]`
   */
  @AllowNull(false)
  @Column(DataType.STRING(255))
  eventKey: string;

  @AllowNull(true)
  @Column(DataType.STRING(64))
  payloadHash: string | null;

  @AllowNull(true)
  @Column(DataType.STRING(64))
  traceId: string | null;

  /**
   * 'processed' | 'duplicate' | 'dropped' | 'error'
   */
  @Default("processed")
  @AllowNull(false)
  @Column(DataType.STRING(20))
  outcome: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  errorMessage: string | null;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  ticketId: number | null;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  messageId: number | null;

  @AllowNull(true)
  @Column(DataType.STRING(500))
  providerMessageId: string | null;

  @AllowNull(false)
  @Default(DataType.NOW)
  @Column(DataType.DATE)
  receivedAt: Date;

  @AllowNull(true)
  @Column(DataType.DATE)
  processedAt: Date | null;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default InboundEventLedger;
