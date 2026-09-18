/**
 * Modelo: DermaAnalysis
 * Un análisis facial ejecutado sobre la foto de un DermaPatient. Guarda la
 * selección de métricas pedida, el resultado estructurado devuelto por el modelo
 * de visión, el coste en créditos y la trazabilidad del proveedor usado.
 *
 * Estados: pending → processing → completed | failed
 */
import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  ForeignKey,
  BelongsTo,
  CreatedAt,
  UpdatedAt,
  AllowNull,
  Index,
  Default,
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";
import DermaPatient from "./DermaPatient";

export type DermaAnalysisStatus =
  "pending" | "processing" | "completed" | "failed";

export interface DermaMetricResult {
  key: string;
  label: string;
  score: number | null; // 0-100, mayor = mejor. null para métricas descriptivas
  severity: "ninguna" | "leve" | "moderada" | "alta" | null;
  findings: string;
  zones: string[];
  recommendation: string;
  value?: string; // valor descriptivo (p.ej. tipo de piel)
}

export interface DermaRecommendation {
  title: string;
  detail: string;
  priority: "alta" | "media" | "baja";
}

export interface DermaClinicalDetail {
  observations: string;
  suggestedTreatments: Array<{
    name: string;
    rationale: string;
    sessions?: string;
  }>;
  homeCare: { morning: string[]; night: string[] };
  cautions: string[];
  followUpWeeks: number | null;
}

export interface DermaAnalysisResult {
  globalScore: number;
  skinType: string;
  skinAge: number | null;
  summary: string;
  metrics: DermaMetricResult[];
  recommendations: DermaRecommendation[];
  clinicalDetail: DermaClinicalDetail | null;
  imageQuality: { ok: boolean; notes: string };
}

@Table({
  tableName: "DermaAnalyses",
  timestamps: true,
})
class DermaAnalysis extends Model<DermaAnalysis> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Index("idx_derma_analyses_company")
  @Column(DataType.INTEGER)
  companyId!: number;

  @ForeignKey(() => DermaPatient)
  @AllowNull(false)
  @Index("idx_derma_analyses_patient")
  @Column(DataType.INTEGER)
  patientId!: number;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column(DataType.INTEGER)
  userId?: number;

  @Default("pending")
  @AllowNull(false)
  @Column(DataType.STRING(20))
  status!: DermaAnalysisStatus;

  /** Ruta absoluta en disco de la foto analizada (bajo public/company{id}/derma). */
  @AllowNull(true)
  @Column(DataType.STRING(500))
  imagePath?: string;

  @AllowNull(true)
  @Column(DataType.STRING(100))
  imageMimeType?: string;

  /** Claves del catálogo (DermaMetricsCatalog) pedidas por el profesional. */
  @Default([])
  @AllowNull(false)
  @Column(DataType.JSONB)
  selectedMetrics!: string[];

  @Default(false)
  @AllowNull(false)
  @Column(DataType.BOOLEAN)
  clinicalDetail!: boolean;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  globalScore?: number;

  @AllowNull(true)
  @Column(DataType.STRING(80))
  skinType?: string;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  skinAge?: number;

  @AllowNull(true)
  @Column(DataType.TEXT)
  summary?: string;

  /** Resultado completo estructurado (DermaAnalysisResult). */
  @AllowNull(true)
  @Column(DataType.JSONB)
  result?: DermaAnalysisResult;

  @Default(0)
  @AllowNull(false)
  @Column(DataType.INTEGER)
  creditsUsed!: number;

  @AllowNull(true)
  @Column(DataType.STRING(50))
  provider?: string;

  @AllowNull(true)
  @Column(DataType.STRING(100))
  model?: string;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  tokensUsed?: number;

  @AllowNull(true)
  @Column(DataType.INTEGER)
  latencyMs?: number;

  @AllowNull(true)
  @Column(DataType.TEXT)
  errorMessage?: string;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;

  @BelongsTo(() => Company)
  company!: Company;

  @BelongsTo(() => DermaPatient)
  patient!: DermaPatient;

  @BelongsTo(() => User)
  user?: User;
}

export default DermaAnalysis;
