/**
 * AICorrectionLearned — Bitácora auditable de cada corrección humana
 * detectada por el sistema, sea auto-aplicada o descartada.
 *
 * Sprint 1 — Loop de Aprendizaje desde Correcciones Humanas (Opción C).
 *
 * Esta tabla NO tiene reglas de negocio activas — es solo registro
 * histórico para auditoría, métricas y debugging. La tabla no afecta el
 * comportamiento del orquestador en tiempo real.
 *
 * outcome posibles:
 *   - auto_applied            → la corrección se aprendió sin revisión humana
 *                               (tipo no crítico + confidence >= 0.85)
 *   - sent_to_review          → fue a AICorrectionReviewQueue
 *   - approved_by_human       → un humano la aprobó desde el panel
 *   - rejected_by_human       → un humano la rechazó
 *   - expired                 → 30 días sin revisar
 *   - skipped_not_correction  → el clasificador dijo que NO era corrección
 *   - skipped_low_quality     → ruido (texto muy corto, emoji, etc.)
 *   - skipped_duplicate       → ya existe AISupportCorrection equivalente
 *   - skipped_disabled        → feature flag desactivado para el company
 *
 * Multi-tenant obligatorio: companyId NOT NULL.
 */
import {
  Table, Column, Model, PrimaryKey, AutoIncrement, DataType,
  ForeignKey, BelongsTo, AllowNull, Default, CreatedAt
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";
import AISupportCorrection from "./AISupportCorrection";
import AICorrectionReviewQueue from "./AICorrectionReviewQueue";
import type { CorrectionType } from "./AICorrectionReviewQueue";

export type LearnedOutcome =
  | "auto_applied"
  | "sent_to_review"
  | "approved_by_human"
  | "rejected_by_human"
  | "expired"
  | "skipped_not_correction"
  | "skipped_low_quality"
  | "skipped_duplicate"
  | "skipped_disabled";

@Table({ tableName: "AICorrectionLearned", timestamps: false })
class AICorrectionLearned extends Model<AICorrectionLearned> {
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
  aiAgentLogId?: number | null;

  @ForeignKey(() => AISupportCorrection)
  @Column({ type: DataType.INTEGER, allowNull: true })
  supportCorrectionId?: number | null;

  @BelongsTo(() => AISupportCorrection)
  supportCorrection?: AISupportCorrection;

  @ForeignKey(() => AICorrectionReviewQueue)
  @Column({ type: DataType.INTEGER, allowNull: true })
  reviewQueueId?: number | null;

  @BelongsTo(() => AICorrectionReviewQueue)
  reviewQueueItem?: AICorrectionReviewQueue;

  @Column({ type: DataType.BIGINT, allowNull: true })
  supersededQaId?: number | null;

  @AllowNull(false)
  @Column(DataType.STRING(40))
  correctionType!: CorrectionType;

  @Column({ type: DataType.TEXT, allowNull: true })
  wrongAiClaim?: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  correctHumanClaim?: string | null;

  @Default({})
  @Column(DataType.JSONB)
  scope!: Record<string, unknown>;

  @AllowNull(false)
  @Column(DataType.STRING(30))
  outcome!: LearnedOutcome;

  @Default(0)
  @Column(DataType.DECIMAL(3, 2))
  classifierConfidence!: number;

  @ForeignKey(() => User)
  @Column({ type: DataType.INTEGER, allowNull: true })
  appliedBy?: number | null;

  @BelongsTo(() => User)
  applier?: User;

  @Default({})
  @Column(DataType.JSONB)
  metadata!: Record<string, unknown>;

  @CreatedAt
  createdAt!: Date;
}

export default AICorrectionLearned;
