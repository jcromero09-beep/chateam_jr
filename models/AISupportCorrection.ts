import {
  Table, Column, Model, DataType, ForeignKey, BelongsTo,
  Default, AllowNull, PrimaryKey, AutoIncrement, CreatedAt, UpdatedAt
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";

/**
 * Origen de la corrección. Sprint 1 (2026-05-20) agrega:
 *   - human_correction_loop: derivada de un mensaje humano que corrigió a la IA
 *
 * Mantenemos compatibilidad con filas legacy: source default = 'admin'.
 */
export type CorrectionSource =
  | "admin"
  | "human_correction_loop"
  | "api"
  | "import";

@Table({ tableName: "AISupportCorrections", timestamps: true })
class AISupportCorrection extends Model<AISupportCorrection> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @AllowNull(false)
  @Column(DataType.TEXT)
  problem: string;

  @AllowNull(false)
  @Column(DataType.TEXT)
  solution: string;

  @Default("general")
  @Column(DataType.STRING(50))
  category: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive: boolean;

  @Default(0)
  @Column(DataType.INTEGER)
  usageCount: number;

  @Column(DataType.DATE)
  lastUsedAt: Date;

  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  createdBy: number;

  @BelongsTo(() => User)
  creator: User;

  // ── Sprint 1 (2026-05-20): Loop de Aprendizaje desde Correcciones Humanas ──
  // Todas las columnas siguientes son ADD-ONLY (BD SAGRADA). Las filas
  // existentes mantienen sus defaults.

  /** Origen de la corrección. Default 'admin' para filas legacy. */
  @Default("admin")
  @Column(DataType.STRING(40))
  source: CorrectionSource;

  /** Tipo de corrección detectado por HumanCorrectionClassifierAgent. */
  @Column(DataType.STRING(40))
  correctionType: string;

  /**
   * Alcance de aplicación: companyId siempre; queueId / productKey / intent
   * pueden estar presentes para limitar el match.
   */
  @Default({})
  @Column(DataType.JSONB)
  scopeJson: Record<string, unknown>;

  /** Usuario humano que verificó (o aprobó desde panel) la corrección. */
  @ForeignKey(() => User)
  @Column(DataType.INTEGER)
  verifiedBy: number;

  @BelongsTo(() => User, { foreignKey: "verifiedBy", as: "verifier" })
  verifier: User;

  @Column(DataType.DATE)
  verifiedAt: Date;

  /** ID del AIAgentLog que disparó la corrección. */
  @Column(DataType.INTEGER)
  sourceAgentLogId: number;

  /** Ticket donde sucedió la corrección. */
  @Column(DataType.INTEGER)
  sourceTicketId: number;

  /**
   * Prioridad de matching en el bloque de prompt y en CorrectionRepeatBlocker.
   * Menor número = mayor prioridad. Default 100.
   * Correcciones del loop de aprendizaje suelen quedar en prioridad 10.
   */
  @Default(100)
  @Column(DataType.INTEGER)
  priority: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AISupportCorrection;
