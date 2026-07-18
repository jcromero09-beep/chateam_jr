/**
 * AICorrectionReviewQueue — Cola de correcciones humanas que requieren
 * revisión antes de convertirse en regla activa.
 *
 * Sprint 1 — Loop de Aprendizaje desde Correcciones Humanas (Opción C).
 *
 * Reglas de negocio:
 *   - Toda corrección que toque dato crítico (price, payment, appointment,
 *     status, contract, availability) cae aquí, INDEPENDIENTEMENTE del
 *     nivel de feature flag AI_LEARNING_LEVEL.
 *   - Una correcciones con classifierConfidence < 0.85 también cae aquí.
 *   - status:
 *       pending    → esperando revisión humana
 *       approved   → un usuario admin la aprobó → genera AISupportCorrection
 *       rejected   → un usuario admin la rechazó (no se aprende)
 *       expired    → no fue revisada en 30 días → no se aprende
 *
 * Multi-tenant obligatorio: companyId NOT NULL.
 */
import {
  Table, Column, Model, PrimaryKey, AutoIncrement, DataType,
  ForeignKey, BelongsTo, AllowNull, Default, CreatedAt, UpdatedAt
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";

export type ReviewStatus = "pending" | "approved" | "rejected" | "expired";

export type CorrectionType =
  | "factual_contradiction"
  | "price_correction"
  | "policy_correction"
  | "appointment_override"
  | "status_override"
  | "payment_override"
  | "contract_override"
  | "availability_override"
  | "human_clarification"
  | "sales_strategy_override"
  | "not_correction";

@Table({ tableName: "AICorrectionReviewQueue", timestamps: true })
class AICorrectionReviewQueue extends Model<AICorrectionReviewQueue> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  companyId!: number;

  @BelongsTo(() => Company)
  company?: Company;

  @Column({ type: DataType.INTEGER, allowNull: true })
  ticketId?: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  contactId?: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  aiAgentLogId?: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  queueId?: number | null;

  @AllowNull(false)
  @Column(DataType.STRING(40))
  correctionType!: CorrectionType;

  @Column({ type: DataType.TEXT, allowNull: true })
  wrongAiClaim?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  correctHumanClaim?: string | null;

  @Column({ type: DataType.STRING(120), allowNull: true })
  entity?: string | null;

  @Column({ type: DataType.STRING(60), allowNull: true })
  field?: string | null;

  @Default({})
  @Column(DataType.JSONB)
  scope!: {
    companyId: number;
    queueId?: number;
    productKey?: string;
    intent?: string;
    [k: string]: unknown;
  };

  @Default(0)
  @Column(DataType.DECIMAL(3, 2))
  classifierConfidence!: number;

  @Default({})
  @Column(DataType.JSONB)
  classifierJson!: Record<string, unknown>;

  @Default("pending")
  @Column(DataType.STRING(20))
  status!: ReviewStatus;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  reviewedBy?: number | null;

  @BelongsTo(() => User)
  reviewer?: User;

  @Column({ type: DataType.DATE, allowNull: true })
  reviewedAt?: Date | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  reviewNotes?: string | null;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;
}

export default AICorrectionReviewQueue;
