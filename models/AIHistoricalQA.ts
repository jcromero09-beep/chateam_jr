/**
 * AIHistoricalQA — Memoria histórica de pares pregunta/respuesta verificados
 * a nivel empresa, reutilizables cross-ticket.
 *
 * Convivencia con otras capas de memoria:
 *   - contact_memory  → hechos de UN contacto (ej: "prefiere WhatsApp")
 *   - AISupportCorrections → correcciones admin-manuales de alta prioridad
 *   - AISemanticCache → cache volátil query→answer 24h
 *   - AIHistoricalQA  → respuestas buenas a preguntas frecuentes, cross-ticket
 *
 * Creado para soportar: reutilización de respuestas válidas previas antes de
 * volver a gastar LLM. Ver CurrentTicketMemoryService / MemoryJudgeAgent /
 * HistoricalQARetrieverService / QAExtractorService.
 */
import {
  Table, Column, Model, PrimaryKey, AutoIncrement,
  DataType, ForeignKey, BelongsTo, CreatedAt, UpdatedAt, Default
} from "sequelize-typescript";
import Company from "./Company";

export type AnswerType = "human" | "ai_verified" | "kb_backed" | "tool_backed";

@Table({ tableName: "AIHistoricalQA", timestamps: true })
class AIHistoricalQA extends Model<AIHistoricalQA> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id!: number;

  @ForeignKey(() => Company)
  @Column({ type: DataType.INTEGER, allowNull: false })
  companyId!: number;

  @BelongsTo(() => Company)
  company?: Company;

  @Column({ type: DataType.INTEGER, allowNull: true })
  sourceTicketId?: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  sourceMessageId?: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  sourceContactId?: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  sourceAgentLogId?: number;

  @Column({ type: DataType.TEXT, allowNull: false })
  question!: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  normalizedQuestion!: string;

  @Column({ type: DataType.TEXT, allowNull: false })
  answer!: string;

  @Default("ai_verified")
  @Column({ type: DataType.STRING(20), allowNull: false })
  answerType!: AnswerType;

  @Column({ type: DataType.STRING(100), allowNull: true })
  intent?: string;

  @Default("es")
  @Column({ type: DataType.STRING(10), allowNull: true })
  language?: string;

  @Column({ type: DataType.STRING(30), allowNull: true })
  channel?: string;

  // tags se mapea como array de texto. Sequelize pg soporta ARRAY(STRING).
  @Column({ type: DataType.ARRAY(DataType.TEXT), allowNull: true })
  tags?: string[];

  @Column({ type: DataType.STRING(100), allowNull: true })
  productKey?: string;

  // embedding vector(1536) — NO lo mapeamos aquí: se gestiona con raw SQL
  // en HistoricalQARetrieverService para evitar fricciones con el tipo vector.

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false })
  usedCount!: number;

  @Column({ type: DataType.DATE, allowNull: true })
  lastUsedAt?: Date;

  @Column({ type: DataType.DECIMAL(3, 2), allowNull: true })
  rating?: number;

  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  verified!: boolean;

  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  superseded!: boolean;

  @Column({ type: DataType.BIGINT, allowNull: true })
  supersededBy?: number;

  @Default({})
  @Column({ type: DataType.JSONB, allowNull: false })
  metadata!: Record<string, unknown>;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;
}

export default AIHistoricalQA;
