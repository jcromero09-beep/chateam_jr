/**
 * CampaignAI — Fase 4: IA Avanzada para Meta Ads
 *
 * Página con 4 pestañas:
 * 1. 🔍 Diagnóstico Profundo — Análisis de 6 tipos de problemas por campaña
 * 2. ✍️ Generador de Copy   — Copy optimizado por nivel de conciencia (Eugene Schwartz)
 * 3. 📊 Score de Creativo   — Scoring predictivo 0-100 antes de lanzar
 * 4. 🚨 Anomalías           — Detección estadística (Z-Score + IQR)
 *
 * [Re-skin] Migrada de MUI Joy al design system Tailwind v4 + shadcn/Radix.
 * Se conservan de @mui/joy SOLO los indicadores de progreso (CircularProgress /
 * LinearProgress), que aún no tienen equivalente en el design system.
 */

import React, { useState, useEffect, useCallback } from "react";
import { CircularProgress, LinearProgress } from "@mui/joy";
import {
  Brain,
  PencilSimple,
  ChartBar,
  Warning,
  ArrowClockwise,
  CheckCircle,
  XCircle,
  Lightbulb,
  Copy as CopyIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "../context/Auth/AuthContext";
import api from "../services/api";

// ============================================================
// TIPOS
// ============================================================

interface Campaign {
  id: string;
  name: string;
  status: string;
  spend?: number;
  impressions?: number;
  ctr?: number;
}

interface DiagnosisItem {
  type: string;
  severity: "critical" | "high" | "medium" | "low" | "none";
  detected: boolean;
  evidence: Record<string, any>;
  impact: string;
  recommendations: string[];
  one_click_actions: Array<{ label: string; action: string; params: Record<string, any> }>;
}

interface DiagnosisResult {
  campaignId: string;
  campaignName: string;
  diagnoses: DiagnosisItem[];
  overallHealth: "critical" | "warning" | "good";
  tokensUsed: number;
}

interface CopyVariation {
  id: string;
  headline: string;
  primaryText: string;
  description: string;
  cta: string;
  hook: string;
  approach: string;
  psychologicalTriggers: string[];
}

interface CopyResult {
  variations: CopyVariation[];
  consciousnessLevel: string;
  consciousnessDescription: string;
  recommendedApproach: string;
  tokensUsed: number;
}

interface FactorScore {
  score: number;
  weight: number;
  weightedScore: number;
  grade: string;
  feedback: string;
  improvements: string[];
}

interface CreativeScore {
  overallScore: number;
  grade: string;
  prediction: string;
  factors: {
    hookStrength: FactorScore;
    headlineClarity: FactorScore;
    ctaEffectiveness: FactorScore;
    emotionalTrigger: FactorScore;
    audienceAlignment: FactorScore;
  };
  topStrengths: string[];
  criticalIssues: string[];
  quickWins: string[];
  benchmarkComparison: string;
  tokensUsed: number;
}

interface AnomalyItem {
  campaignId: string;
  campaignName: string;
  metric: string;
  metricLabel: string;
  currentValue: number;
  historicalAvg: number;
  expectedMin: number;
  expectedMax: number;
  deviation: number;
  severity: "critical" | "warning" | "info";
  direction: "spike" | "drop" | "unusual";
  description: string;
  suggestion: string;
  algorithm: string;
  detectedAt: string;
}

interface AnomalyResult {
  totalCampaigns: number;
  anomaliesFound: number;
  critical: number;
  warnings: number;
  infos: number;
  anomalies: AnomalyItem[];
  summary: string;
  analyzedAt: string;
}

interface CopyMetadata {
  consciousnessLevels: Array<{ value: string; label: string; description: string }>;
  tones: Array<{ value: string; label: string }>;
  objectives: Array<{ value: string; label: string }>;
}

// ============================================================
// HELPERS
// ============================================================

const DIAGNOSIS_LABELS: Record<string, { label: string; icon: string }> = {
  creative_fatigue: { label: "Fatiga Creativa", icon: "🎨" },
  audience_saturation: { label: "Saturación de Audiencia", icon: "👥" },
  bid_competition: { label: "Competencia en Subasta", icon: "💰" },
  learning_phase_stuck: { label: "Fase de Aprendizaje", icon: "🧠" },
  budget_constraint: { label: "Restricción de Presupuesto", icon: "💳" },
  placement_mismatch: { label: "Desajuste de Placements", icon: "📱" }
};

/** Tonos semánticos del design system (superficie + texto accesible). */
type Tone = "destructive" | "warning" | "success" | "primary" | "neutral";

const TONE_SURFACE: Record<Tone, string> = {
  destructive: "border-destructive/25 bg-destructive/10",
  warning: "border-warning/25 bg-warning/12",
  success: "border-success/25 bg-success/12",
  primary: "border-primary/25 bg-primary/10",
  neutral: "border-border bg-muted",
};

// [a11y] Los tokens de superficie (--success/--warning/--destructive) no llegan a
// 4.5:1 como texto en claro; para texto van los *-text.
const TONE_TEXT: Record<Tone, string> = {
  destructive: "text-destructive-text",
  warning: "text-warning-text",
  success: "text-success-text",
  primary: "text-primary",
  neutral: "text-muted-foreground",
};

const CARD = "rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]";

const TEXTAREA_CLS =
  "w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors [font-family:inherit] placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

const getSeverityVariant = (severity: string): BadgeProps["variant"] => {
  switch (severity) {
    case "critical": return "destructive";
    case "high": case "warning": return "warning";
    case "medium": case "low": return "success";
    default: return "neutral";
  }
};

/** Color para los progress de MUI Joy (paleta Joy, no del design system). */
const getScoreColor = (score: number): "danger" | "warning" | "success" | "primary" => {
  if (score >= 80) return "success";
  if (score >= 60) return "primary";
  if (score >= 40) return "warning";
  return "danger";
};

const getScoreTone = (score: number): Tone => {
  if (score >= 80) return "success";
  if (score >= 60) return "primary";
  if (score >= 40) return "warning";
  return "destructive";
};

const getScoreVariant = (score: number): BadgeProps["variant"] => {
  if (score >= 80) return "success";
  if (score >= 60) return "primary";
  if (score >= 40) return "warning";
  return "destructive";
};

const FACTOR_LABELS: Record<string, string> = {
  hookStrength: "Fortaleza del Hook",
  headlineClarity: "Claridad del Titular",
  ctaEffectiveness: "Efectividad del CTA",
  emotionalTrigger: "Gatillo Emocional",
  audienceAlignment: "Alineación con Audiencia"
};

// ============================================================
// SUBCOMPONENTES DE PRESENTACIÓN
// ============================================================

/** Reemplaza <Alert> de Joy con tokens del design system. */
function Callout({
  tone = "neutral",
  icon,
  className,
  role = "status",
  children,
}: {
  tone?: Tone;
  icon?: React.ReactNode;
  className?: string;
  role?: "status" | "alert";
  children: React.ReactNode;
}) {
  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm",
        TONE_SURFACE[tone],
        tone === "neutral" ? "text-foreground" : TONE_TEXT[tone],
        className,
      )}
    >
      {icon && <span className="mt-px shrink-0 [&_svg]:size-[18px]">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Campo de formulario: label + control + hint (reemplaza FormControl/FormLabel). */
function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="ml-0.5 text-destructive-text" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Lista de bullets con flecha (reemplaza Typography startDecorator="→"). */
function ArrowList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("m-0 list-none space-y-0.5 p-0", className)}>
      {items.map((it, i) => (
        <li key={i} className="flex gap-1.5">
          <span aria-hidden>→</span>
          <span className="min-w-0 flex-1">{it}</span>
        </li>
      ))}
    </ul>
  );
}

/** Botón de copiar al portapapeles (reemplaza IconButton). */
function CopyButton({
  copied,
  label,
  onClick,
}: {
  copied: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn("size-8", copied && "text-success-text")}
    >
      {copied ? (
        <CheckCircle className="size-[18px]" weight="fill" aria-hidden />
      ) : (
        <CopyIcon className="size-[18px]" aria-hidden />
      )}
    </Button>
  );
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

const CampaignAI: React.FC = () => {
  const auth = useAuth();
  const user = auth?.user;
  const [activeTab, setActiveTab] = useState(0);

  // Datos compartidos
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // Tab 1: Diagnóstico
  const [diagCampaignId, setDiagCampaignId] = useState<string>("");
  const [diagResult, setDiagResult] = useState<DiagnosisResult | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);

  // Tab 2: Copy Generator
  const [copyMeta, setCopyMeta] = useState<CopyMetadata | null>(null);
  const [copyForm, setCopyForm] = useState({
    productName: "",
    productDescription: "",
    targetAudience: "",
    consciousnessLevel: "problem_aware",
    tone: "professional",
    objective: "SALES",
    industry: "",
    uniqueValueProposition: "",
    callToAction: "",
    variationsCount: 3
  });
  const [copyResult, setCopyResult] = useState<CopyResult | null>(null);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Tab 3: Scoring
  const [scoreForm, setScoreForm] = useState({
    headline: "",
    primaryText: "",
    description: "",
    cta: "",
    targetAudience: "",
    objective: "SALES",
    industry: "",
    imageDescription: ""
  });
  const [scoreResult, setScoreResult] = useState<CreativeScore | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);

  // Tab 4: Anomalías
  const [anomalyResult, setAnomalyResult] = useState<AnomalyResult | null>(null);
  const [anomalyLoading, setAnomalyLoading] = useState(false);
  const [anomalyError, setAnomalyError] = useState<string | null>(null);
  const [anomalyPeriod, setAnomalyPeriod] = useState("last_30_days");
  const [selectedAnomaly, setSelectedAnomaly] = useState<AnomalyItem | null>(null);

  // ──────────────────────────────────────────────────────────
  // CARGA INICIAL
  // ──────────────────────────────────────────────────────────

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const resp = await api.get("/meta-marketing/campaigns?includeInsights=true");
      const data = resp.data?.data?.campaigns || resp.data?.data || [];
      setCampaigns(Array.isArray(data) ? data : []);
    } catch {
      setCampaigns([]);
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);

  const loadCopyMetadata = useCallback(async () => {
    try {
      const resp = await api.get("/meta-marketing/ai/copy/metadata");
      setCopyMeta(resp.data?.data || null);
    } catch {}
  }, []);

  useEffect(() => {
    loadCampaigns();
    loadCopyMetadata();
  }, [loadCampaigns, loadCopyMetadata]);

  // ──────────────────────────────────────────────────────────
  // TAB 1: DIAGNÓSTICO
  // ──────────────────────────────────────────────────────────

  const runDiagnosis = async () => {
    if (!diagCampaignId) return;
    setDiagLoading(true);
    setDiagError(null);
    setDiagResult(null);
    try {
      const resp = await api.post("/meta-marketing/ai/diagnose", {
        campaignId: diagCampaignId,
        campaignsData: campaigns
      });
      setDiagResult(resp.data?.data || null);
    } catch (err: any) {
      setDiagError(err.response?.data?.message || "Error al ejecutar diagnóstico");
    } finally {
      setDiagLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────────
  // TAB 2: COPY GENERATOR
  // ──────────────────────────────────────────────────────────

  const generateCopy = async () => {
    if (!copyForm.productName || !copyForm.productDescription || !copyForm.targetAudience) return;
    setCopyLoading(true);
    setCopyError(null);
    setCopyResult(null);
    try {
      const resp = await api.post("/meta-marketing/ai/copy/generate", copyForm);
      setCopyResult(resp.data?.data || null);
    } catch (err: any) {
      setCopyError(err.response?.data?.message || "Error al generar copy");
    } finally {
      setCopyLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // ──────────────────────────────────────────────────────────
  // TAB 3: SCORING
  // ──────────────────────────────────────────────────────────

  const scoreCreative = async () => {
    if (!scoreForm.headline || !scoreForm.primaryText || !scoreForm.targetAudience) return;
    setScoreLoading(true);
    setScoreError(null);
    setScoreResult(null);
    try {
      const resp = await api.post("/meta-marketing/ai/creative/score", scoreForm);
      setScoreResult(resp.data?.data || null);
    } catch (err: any) {
      setScoreError(err.response?.data?.message || "Error al calcular score");
    } finally {
      setScoreLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────────
  // TAB 4: ANOMALÍAS
  // ──────────────────────────────────────────────────────────

  const detectAnomalies = async () => {
    setAnomalyLoading(true);
    setAnomalyError(null);
    try {
      const resp = await api.get(`/meta-marketing/ai/anomalies?period=${anomalyPeriod}`);
      setAnomalyResult(resp.data?.data || null);
    } catch (err: any) {
      setAnomalyError(err.response?.data?.message || "Error al detectar anomalías");
    } finally {
      setAnomalyLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <Brain className="size-6" weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              IA Avanzada para Meta Ads
            </h1>
            <p className="text-sm text-muted-foreground">
              Diagnóstico inteligente, generación de copy, scoring predictivo y detección de anomalías
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs
          value={String(activeTab)}
          onValueChange={(v) => setActiveTab(Number(v))}
          className="space-y-6"
        >
          <TabsList className="flex-wrap">
            <TabsTrigger value="0">
              <Brain className="size-[18px]" aria-hidden />
              Diagnóstico
            </TabsTrigger>
            <TabsTrigger value="1">
              <PencilSimple className="size-[18px]" aria-hidden />
              Generador de Copy
            </TabsTrigger>
            <TabsTrigger value="2">
              <ChartBar className="size-[18px]" aria-hidden />
              Score de Creativo
            </TabsTrigger>
            <TabsTrigger value="3">
              <Warning className="size-[18px]" aria-hidden />
              Anomalías
            </TabsTrigger>
          </TabsList>

          {/* ══════════════════════════════════════════════════════ */}
          {/* TAB 1: DIAGNÓSTICO PROFUNDO */}
          {/* ══════════════════════════════════════════════════════ */}
          <TabsContent value="0" className="mt-0 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                🔍 Diagnóstico Profundo de Campaña
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Analiza 6 tipos de problemas: fatiga creativa, saturación de audiencia, competencia en subasta,
                fase de aprendizaje bloqueada, restricción de presupuesto y desajuste de placements.
              </p>
            </div>

            <div className={cn(CARD, "space-y-4")}>
              <Field label="Selecciona una campaña" htmlFor="diag-campaign">
                <Select
                  value={diagCampaignId}
                  onValueChange={(v) => setDiagCampaignId(v)}
                  disabled={loadingCampaigns}
                >
                  <SelectTrigger id="diag-campaign" className="h-11">
                    <SelectValue
                      placeholder={loadingCampaigns ? "Cargando campañas..." : "Elige una campaña para diagnosticar"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.impressions ? `(${Number(c.impressions).toLocaleString()} impresiones)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div>
                <Button
                  onClick={runDiagnosis}
                  disabled={!diagCampaignId || diagLoading}
                  loading={diagLoading}
                >
                  {!diagLoading && <Brain className="size-4" weight="fill" aria-hidden />}
                  {diagLoading ? "Analizando con IA..." : "Ejecutar Diagnóstico"}
                </Button>
              </div>
            </div>

            {diagError && (
              <Callout tone="destructive" role="alert" icon={<XCircle weight="fill" aria-hidden />}>
                {diagError}
              </Callout>
            )}

            {diagResult && (
              <div className="space-y-4">
                {/* Salud General */}
                {(() => {
                  const healthTone: Tone =
                    diagResult.overallHealth === "critical"
                      ? "destructive"
                      : diagResult.overallHealth === "warning"
                        ? "warning"
                        : "success";
                  return (
                    <div
                      className={cn(
                        "flex items-center gap-3 rounded-xl border p-5",
                        TONE_SURFACE[healthTone],
                      )}
                    >
                      <span className={cn("shrink-0", TONE_TEXT[healthTone])}>
                        {diagResult.overallHealth === "critical" ? (
                          <XCircle className="size-7" weight="fill" aria-hidden />
                        ) : diagResult.overallHealth === "warning" ? (
                          <Warning className="size-7" weight="fill" aria-hidden />
                        ) : (
                          <CheckCircle className="size-7" weight="fill" aria-hidden />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">
                          Campaña: {diagResult.campaignName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Salud general:{" "}
                          <strong className={TONE_TEXT[healthTone]}>
                            {diagResult.overallHealth === "critical"
                              ? "🔴 Crítica"
                              : diagResult.overallHealth === "warning"
                                ? "🟡 Advertencia"
                                : "🟢 Buena"}
                          </strong>
                          {" · "}Tokens usados: {diagResult.tokensUsed}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Lista de diagnósticos */}
                <div className="space-y-3">
                  {diagResult.diagnoses.map((d) => {
                    const meta = DIAGNOSIS_LABELS[d.type] || { label: d.type, icon: "🔍" };
                    return (
                      <div key={d.type} className={CARD}>
                        <div className="flex items-start gap-3">
                          <span className="text-2xl leading-none" aria-hidden>{meta.icon}</span>
                          <div className="min-w-0 flex-1">
                            <div className="mb-1.5 flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-foreground">{meta.label}</h3>
                              <Badge variant={d.detected ? getSeverityVariant(d.severity) : "neutral"}>
                                {d.detected ? d.severity.toUpperCase() : "OK"}
                              </Badge>
                            </div>

                            {d.detected && d.impact && (
                              <p className="mb-1.5 text-sm text-destructive-text">{d.impact}</p>
                            )}

                            {!d.detected && (
                              <p className="text-sm text-success-text">
                                ✅ No se detectaron problemas de este tipo
                              </p>
                            )}

                            {d.detected && d.recommendations.length > 0 && (
                              <div className="mt-2">
                                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                                  Recomendaciones:
                                </p>
                                <ArrowList items={d.recommendations} className="text-xs text-foreground" />
                              </div>
                            )}

                            {/* Evidencia */}
                            {d.detected && Object.keys(d.evidence || {}).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {Object.entries(d.evidence).map(([k, v]) => (
                                  <Badge key={k} variant="outline">
                                    {k}: {typeof v === "number" ? v.toFixed(2) : String(v)}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ══════════════════════════════════════════════════════ */}
          {/* TAB 2: GENERADOR DE COPY */}
          {/* ══════════════════════════════════════════════════════ */}
          <TabsContent value="1" className="mt-0 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                ✍️ Generador de Copy para Meta Ads
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Genera copy optimizado usando el framework de los 5 niveles de conciencia de Eugene Schwartz.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Formulario */}
              <div className={CARD}>
                <h3 className="mb-4 text-sm font-semibold text-foreground">📝 Datos del producto</h3>
                <div className="space-y-4">
                  <Field label="Nombre del producto/servicio" htmlFor="copy-product-name" required>
                    <Input
                      id="copy-product-name"
                      placeholder="Ej: Curso de Marketing Digital"
                      value={copyForm.productName}
                      onChange={e => setCopyForm(f => ({ ...f, productName: e.target.value }))}
                    />
                  </Field>

                  <Field label="Descripción del producto" htmlFor="copy-product-desc" required>
                    <textarea
                      id="copy-product-desc"
                      rows={2}
                      className={TEXTAREA_CLS}
                      placeholder="¿Qué hace? ¿Qué problema resuelve? ¿Cuál es el precio?"
                      value={copyForm.productDescription}
                      onChange={e => setCopyForm(f => ({ ...f, productDescription: e.target.value }))}
                    />
                  </Field>

                  <Field label="Audiencia objetivo" htmlFor="copy-audience" required>
                    <textarea
                      id="copy-audience"
                      rows={2}
                      className={TEXTAREA_CLS}
                      placeholder="Ej: Emprendedores de 25-45 años que quieren generar ingresos online..."
                      value={copyForm.targetAudience}
                      onChange={e => setCopyForm(f => ({ ...f, targetAudience: e.target.value }))}
                    />
                  </Field>

                  <Field label="Propuesta de valor única" htmlFor="copy-uvp">
                    <Input
                      id="copy-uvp"
                      placeholder="¿Qué te hace diferente de la competencia?"
                      value={copyForm.uniqueValueProposition}
                      onChange={e => setCopyForm(f => ({ ...f, uniqueValueProposition: e.target.value }))}
                    />
                  </Field>

                  <Field label="Industria" htmlFor="copy-industry">
                    <Input
                      id="copy-industry"
                      placeholder="Ej: Educación online, Salud, E-commerce..."
                      value={copyForm.industry}
                      onChange={e => setCopyForm(f => ({ ...f, industry: e.target.value }))}
                    />
                  </Field>

                  <Field
                    label="🧠 Nivel de conciencia del usuario"
                    htmlFor="copy-consciousness"
                    required
                    hint={
                      copyMeta
                        ? copyMeta.consciousnessLevels.find(l => l.value === copyForm.consciousnessLevel)?.description
                        : undefined
                    }
                  >
                    <Select
                      value={copyForm.consciousnessLevel}
                      onValueChange={(v) => setCopyForm(f => ({ ...f, consciousnessLevel: v }))}
                    >
                      <SelectTrigger id="copy-consciousness" className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(copyMeta?.consciousnessLevels || [
                          { value: "unaware", label: "Sin conciencia" },
                          { value: "problem_aware", label: "Consciente del problema" },
                          { value: "solution_aware", label: "Consciente de la solución" },
                          { value: "product_aware", label: "Consciente del producto" },
                          { value: "most_aware", label: "Listo para comprar" }
                        ]).map(l => (
                          <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Tono" htmlFor="copy-tone">
                      <Select
                        value={copyForm.tone}
                        onValueChange={(v) => setCopyForm(f => ({ ...f, tone: v }))}
                      >
                        <SelectTrigger id="copy-tone" className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(copyMeta?.tones || [
                            { value: "professional", label: "Profesional" },
                            { value: "casual", label: "Casual" },
                            { value: "urgent", label: "Urgente" }
                          ]).map(t => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="Objetivo" htmlFor="copy-objective">
                      <Select
                        value={copyForm.objective}
                        onValueChange={(v) => setCopyForm(f => ({ ...f, objective: v }))}
                      >
                        <SelectTrigger id="copy-objective" className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(copyMeta?.objectives || [
                            { value: "SALES", label: "Ventas" },
                            { value: "LEADS", label: "Leads" },
                            { value: "TRAFFIC", label: "Tráfico" }
                          ]).map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>

                  <Field label="Número de variaciones (1-5)" htmlFor="copy-variations">
                    <Select
                      value={String(copyForm.variationsCount)}
                      onValueChange={(v) => setCopyForm(f => ({ ...f, variationsCount: Number(v) }))}
                    >
                      <SelectTrigger id="copy-variations" className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map(n => (
                          <SelectItem key={n} value={String(n)}>
                            {n} variación{n > 1 ? "es" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  {copyError && (
                    <Callout tone="destructive" role="alert" icon={<XCircle weight="fill" aria-hidden />}>
                      {copyError}
                    </Callout>
                  )}

                  <Button
                    onClick={generateCopy}
                    disabled={!copyForm.productName || !copyForm.productDescription || !copyForm.targetAudience || copyLoading}
                    loading={copyLoading}
                    className="w-full"
                  >
                    {!copyLoading && <PencilSimple className="size-4" aria-hidden />}
                    {copyLoading ? "Generando con IA..." : "Generar Copy"}
                  </Button>
                </div>
              </div>

              {/* Resultados */}
              <div>
                {!copyResult && !copyLoading && (
                  <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 p-6 text-center">
                    <PencilSimple className="size-12 text-muted-foreground/60" aria-hidden />
                    <p className="text-sm text-muted-foreground">
                      Las variaciones de copy aparecerán aquí
                    </p>
                  </div>
                )}

                {copyResult && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {copyResult.variations.length} variaciones generadas · {copyResult.tokensUsed} tokens usados
                    </p>

                    {copyResult.variations.map((v, idx) => (
                      <div key={v.id} className={CARD}>
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold text-foreground">Variación {idx + 1}</h3>
                          <div className="flex flex-wrap justify-end gap-1">
                            {v.psychologicalTriggers?.slice(0, 2).map(t => (
                              <Badge key={t} variant="primary">{t}</Badge>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground">HOOK (apertura)</p>
                            <p className="text-sm italic text-foreground">"{v.hook}"</p>
                          </div>

                          <div className="border-t border-border" />

                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-muted-foreground">TITULAR (headline)</p>
                              <CopyButton
                                copied={copiedId === `h_${idx}`}
                                label={`Copiar titular de la variación ${idx + 1}`}
                                onClick={() => copyToClipboard(v.headline, `h_${idx}`)}
                              />
                            </div>
                            <p className="font-semibold text-foreground">{v.headline}</p>
                          </div>

                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-muted-foreground">TEXTO PRINCIPAL</p>
                              <CopyButton
                                copied={copiedId === `p_${idx}`}
                                label={`Copiar texto principal de la variación ${idx + 1}`}
                                onClick={() => copyToClipboard(v.primaryText, `p_${idx}`)}
                              />
                            </div>
                            <p className="text-sm text-foreground">{v.primaryText}</p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="primary">{v.cta}</Badge>
                            <span className="text-xs text-muted-foreground">{v.approach}</span>
                          </div>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyToClipboard(
                              `Hook: ${v.hook}\n\nTitular: ${v.headline}\n\nTexto: ${v.primaryText}\n\nDescripción: ${v.description}\n\nCTA: ${v.cta}`,
                              `all_${idx}`
                            )}
                          >
                            <CopyIcon className="size-4" aria-hidden />
                            {copiedId === `all_${idx}` ? "✓ Copiado" : "Copiar todo"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════ */}
          {/* TAB 3: SCORE DE CREATIVO */}
          {/* ══════════════════════════════════════════════════════ */}
          <TabsContent value="2" className="mt-0 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                📊 Score Predictivo de Creativo
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Predice el rendimiento de tu creativo ANTES de lanzarlo. Score 0-100 con 5 factores ponderados.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Formulario */}
              <div className={CARD}>
                <h3 className="mb-4 text-sm font-semibold text-foreground">📝 Contenido del creativo</h3>
                <div className="space-y-4">
                  <Field
                    label="Titular (headline)"
                    htmlFor="score-headline"
                    required
                    hint={
                      <span className={scoreForm.headline.length > 40 ? "text-destructive-text" : undefined}>
                        {scoreForm.headline.length}/40 caracteres
                      </span>
                    }
                  >
                    <Input
                      id="score-headline"
                      placeholder="Max 40 caracteres"
                      value={scoreForm.headline}
                      invalid={scoreForm.headline.length > 40}
                      onChange={e => setScoreForm(f => ({ ...f, headline: e.target.value }))}
                    />
                  </Field>

                  <Field label="Texto principal (primary text)" htmlFor="score-primary" required>
                    <textarea
                      id="score-primary"
                      rows={3}
                      className={TEXTAREA_CLS}
                      placeholder="Escribe el cuerpo del anuncio..."
                      value={scoreForm.primaryText}
                      onChange={e => setScoreForm(f => ({ ...f, primaryText: e.target.value }))}
                    />
                  </Field>

                  <Field label="Descripción (link description)" htmlFor="score-desc">
                    <Input
                      id="score-desc"
                      placeholder="Max 30 caracteres"
                      value={scoreForm.description}
                      onChange={e => setScoreForm(f => ({ ...f, description: e.target.value }))}
                    />
                  </Field>

                  <Field label="Botón CTA" htmlFor="score-cta">
                    <Input
                      id="score-cta"
                      placeholder="Ej: Comprar ahora, Más información, Registrarse..."
                      value={scoreForm.cta}
                      onChange={e => setScoreForm(f => ({ ...f, cta: e.target.value }))}
                    />
                  </Field>

                  <Field label="Audiencia objetivo" htmlFor="score-audience" required>
                    <textarea
                      id="score-audience"
                      rows={2}
                      className={TEXTAREA_CLS}
                      placeholder="Describe tu audiencia objetivo..."
                      value={scoreForm.targetAudience}
                      onChange={e => setScoreForm(f => ({ ...f, targetAudience: e.target.value }))}
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Objetivo" htmlFor="score-objective" required>
                      <Select
                        value={scoreForm.objective}
                        onValueChange={(v) => setScoreForm(f => ({ ...f, objective: v }))}
                      >
                        <SelectTrigger id="score-objective" className="h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SALES">Ventas</SelectItem>
                          <SelectItem value="LEADS">Leads</SelectItem>
                          <SelectItem value="TRAFFIC">Tráfico</SelectItem>
                          <SelectItem value="AWARENESS">Reconocimiento</SelectItem>
                          <SelectItem value="ENGAGEMENT">Interacción</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="Industria" htmlFor="score-industry">
                      <Input
                        id="score-industry"
                        placeholder="Ej: E-commerce"
                        value={scoreForm.industry}
                        onChange={e => setScoreForm(f => ({ ...f, industry: e.target.value }))}
                      />
                    </Field>
                  </div>

                  <Field label="Descripción del visual (opcional)" htmlFor="score-image">
                    <textarea
                      id="score-image"
                      rows={2}
                      className={TEXTAREA_CLS}
                      placeholder="Describe la imagen o video que acompaña el anuncio..."
                      value={scoreForm.imageDescription}
                      onChange={e => setScoreForm(f => ({ ...f, imageDescription: e.target.value }))}
                    />
                  </Field>

                  {scoreError && (
                    <Callout tone="destructive" role="alert" icon={<XCircle weight="fill" aria-hidden />}>
                      {scoreError}
                    </Callout>
                  )}

                  <Button
                    onClick={scoreCreative}
                    disabled={!scoreForm.headline || !scoreForm.primaryText || !scoreForm.targetAudience || scoreLoading}
                    loading={scoreLoading}
                    className="w-full"
                  >
                    {!scoreLoading && <ChartBar className="size-4" aria-hidden />}
                    {scoreLoading ? "Calculando score..." : "Calcular Score Predictivo"}
                  </Button>
                </div>
              </div>

              {/* Resultados */}
              <div>
                {!scoreResult && !scoreLoading && (
                  <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 p-6 text-center">
                    <ChartBar className="size-12 text-muted-foreground/60" aria-hidden />
                    <p className="text-sm text-muted-foreground">
                      El análisis del creativo aparecerá aquí
                    </p>
                  </div>
                )}

                {scoreResult && (
                  <div className="space-y-3">
                    {/* Score general */}
                    <div
                      className={cn(
                        "rounded-xl border p-5",
                        TONE_SURFACE[getScoreTone(scoreResult.overallScore)],
                      )}
                    >
                      <div className="flex items-center gap-5">
                        <div className="relative inline-flex shrink-0">
                          {/* [MUI conservado] CircularProgress: sin equivalente en el DS */}
                          <CircularProgress
                            determinate
                            value={scoreResult.overallScore}
                            size="lg"
                            sx={{ "--CircularProgress-size": "80px" }}
                            color={getScoreColor(scoreResult.overallScore)}
                          />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-lg font-bold tabular-nums text-foreground">
                              {scoreResult.overallScore}
                            </span>
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="mb-1">
                            <Badge
                              variant={getScoreVariant(scoreResult.overallScore)}
                              className="px-3 py-1 text-sm"
                            >
                              Grado {scoreResult.grade}
                            </Badge>
                          </div>
                          <p className="text-sm text-foreground">{scoreResult.prediction}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {scoreResult.tokensUsed} tokens usados
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Factores */}
                    <div className={CARD}>
                      <h3 className="mb-4 text-sm font-semibold text-foreground">Desglose por factores</h3>
                      <div className="space-y-4">
                        {Object.entries(scoreResult.factors).map(([key, factor]) => (
                          <div key={key}>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="text-sm text-foreground">{FACTOR_LABELS[key] || key}</span>
                              <span className="flex items-center gap-2">
                                <Badge variant={getScoreVariant(factor.score)}>{factor.grade}</Badge>
                                <span className="text-sm font-semibold tabular-nums text-foreground">
                                  {factor.score}/100
                                </span>
                              </span>
                            </div>
                            {/* [MUI conservado] LinearProgress: sin equivalente en el DS */}
                            <LinearProgress
                              determinate
                              value={factor.score}
                              color={getScoreColor(factor.score)}
                              size="sm"
                            />
                            <p className="mt-1 text-xs text-muted-foreground">{factor.feedback}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Fortalezas y problemas */}
                    {scoreResult.topStrengths.length > 0 && (
                      <div className={cn("rounded-xl border p-5", TONE_SURFACE.success)}>
                        <h3 className="mb-1.5 text-sm font-semibold text-foreground">✅ Fortalezas</h3>
                        <ArrowList items={scoreResult.topStrengths} className="text-sm text-success-text" />
                      </div>
                    )}

                    {scoreResult.criticalIssues.length > 0 && (
                      <div className={cn("rounded-xl border p-5", TONE_SURFACE.destructive)}>
                        <h3 className="mb-1.5 text-sm font-semibold text-foreground">❌ Problemas críticos</h3>
                        <ArrowList items={scoreResult.criticalIssues} className="text-sm text-destructive-text" />
                      </div>
                    )}

                    {scoreResult.quickWins.length > 0 && (
                      <div className={cn("rounded-xl border p-5", TONE_SURFACE.warning)}>
                        <h3 className="mb-1.5 text-sm font-semibold text-foreground">⚡ Quick wins</h3>
                        <ArrowList items={scoreResult.quickWins} className="text-sm text-warning-text" />
                      </div>
                    )}

                    {scoreResult.benchmarkComparison && (
                      <Callout tone="neutral">{scoreResult.benchmarkComparison}</Callout>
                    )}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ══════════════════════════════════════════════════════ */}
          {/* TAB 4: ANOMALÍAS */}
          {/* ══════════════════════════════════════════════════════ */}
          <TabsContent value="3" className="mt-0 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">🚨 Detección de Anomalías</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Detecta comportamientos estadísticamente inusuales (Z-Score + IQR) en tus campañas.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Select value={anomalyPeriod} onValueChange={(v) => setAnomalyPeriod(v)}>
                  <SelectTrigger className="min-w-[160px]" aria-label="Periodo de análisis">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last_7_days">Últimos 7 días</SelectItem>
                    <SelectItem value="last_14_days">Últimos 14 días</SelectItem>
                    <SelectItem value="last_30_days">Últimos 30 días</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={detectAnomalies} loading={anomalyLoading}>
                  {!anomalyLoading && <ArrowClockwise className="size-4" aria-hidden />}
                  Detectar Anomalías
                </Button>
              </div>
            </div>

            {anomalyError && (
              <Callout tone="destructive" role="alert" icon={<XCircle weight="fill" aria-hidden />}>
                {anomalyError}
              </Callout>
            )}

            {!anomalyResult && !anomalyLoading && (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 p-8 text-center">
                <Warning className="size-12 text-muted-foreground/60" aria-hidden />
                <p className="text-sm text-muted-foreground">
                  Haz clic en "Detectar Anomalías" para analizar tus campañas
                </p>
              </div>
            )}

            {anomalyResult && (
              <div className="space-y-4">
                {/* Resumen */}
                <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
                  {([
                    { label: "Campañas analizadas", value: anomalyResult.totalCampaigns, tone: "primary" as Tone },
                    { label: "Anomalías encontradas", value: anomalyResult.anomaliesFound, tone: (anomalyResult.anomaliesFound > 0 ? "warning" : "success") as Tone },
                    { label: "Críticas", value: anomalyResult.critical, tone: (anomalyResult.critical > 0 ? "destructive" : "success") as Tone },
                    { label: "Advertencias", value: anomalyResult.warnings, tone: (anomalyResult.warnings > 0 ? "warning" : "success") as Tone }
                  ]).map(stat => (
                    <div
                      key={stat.label}
                      className={cn("rounded-xl border p-4 text-center", TONE_SURFACE[stat.tone])}
                    >
                      <p className={cn("text-3xl font-semibold tabular-nums", TONE_TEXT[stat.tone])}>
                        {stat.value}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  ))}
                </div>

                <Callout
                  tone={anomalyResult.critical > 0 ? "destructive" : anomalyResult.warnings > 0 ? "warning" : "success"}
                >
                  {anomalyResult.summary}
                </Callout>

                {/* Lista de anomalías */}
                {anomalyResult.anomalies.length === 0 ? (
                  <div className={cn("rounded-xl border p-6 text-center", TONE_SURFACE.success)}>
                    <CheckCircle className="mx-auto mb-2 size-10 text-success-text" weight="fill" aria-hidden />
                    <p className="font-medium text-foreground">
                      ✅ Todas las campañas están dentro de rangos normales
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {anomalyResult.anomalies.map((anomaly, idx) => (
                      <button
                        key={`${anomaly.campaignId}_${anomaly.metric}_${idx}`}
                        type="button"
                        onClick={() => setSelectedAnomaly(anomaly)}
                        className={cn(
                          CARD,
                          "block w-full cursor-pointer appearance-none text-left [font-family:inherit] transition-shadow",
                          "outline-none hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <Badge variant={getSeverityVariant(anomaly.severity)}>
                            {anomaly.severity === "critical" ? "CRÍTICO" : "AVISO"}
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground">{anomaly.description}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                              <span className="text-xs text-muted-foreground">
                                Campaña: <strong className="text-foreground">{anomaly.campaignName}</strong>
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Métrica: <strong className="text-foreground">{anomaly.metricLabel}</strong>
                              </span>
                              <span
                                className={cn(
                                  "text-xs",
                                  anomaly.deviation > 0 ? "text-destructive-text" : "text-success-text",
                                )}
                              >
                                Desviación:{" "}
                                <strong>
                                  {anomaly.deviation > 0 ? "+" : ""}{anomaly.deviation.toFixed(1)}%
                                </strong>
                              </span>
                              <Badge variant="outline">{anomaly.algorithm}</Badge>
                            </div>
                          </div>
                          <Lightbulb className="size-5 shrink-0 text-warning-text" weight="fill" aria-hidden />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Modal de detalle de anomalía */}
            <Dialog
              open={!!selectedAnomaly}
              onOpenChange={(open) => { if (!open) setSelectedAnomaly(null); }}
            >
              <DialogContent className="max-w-[560px]" aria-describedby={undefined}>
                <DialogHeader>
                  <DialogTitle>Detalle de Anomalía</DialogTitle>
                </DialogHeader>

                {selectedAnomaly && (
                  <div className="space-y-4">
                    <div>
                      <Badge variant={getSeverityVariant(selectedAnomaly.severity)}>
                        {selectedAnomaly.severity.toUpperCase()}
                      </Badge>
                    </div>

                    <p className="text-sm text-foreground">{selectedAnomaly.description}</p>

                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Valor actual", value: selectedAnomaly.currentValue.toFixed(2) },
                        { label: "Promedio histórico", value: selectedAnomaly.historicalAvg.toFixed(2) },
                        { label: "Desviación", value: `${selectedAnomaly.deviation > 0 ? "+" : ""}${selectedAnomaly.deviation.toFixed(1)}%` }
                      ].map(stat => (
                        <div
                          key={stat.label}
                          className="rounded-lg border border-border bg-muted/50 p-3 text-center"
                        >
                          <p className="font-semibold tabular-nums text-foreground">{stat.value}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{stat.label}</p>
                        </div>
                      ))}
                    </div>

                    <Callout tone="warning" icon={<Lightbulb weight="fill" aria-hidden />}>
                      {selectedAnomaly.suggestion}
                    </Callout>

                    <p className="text-xs text-muted-foreground">
                      Algoritmo: {selectedAnomaly.algorithm} · Detectado:{" "}
                      {new Date(selectedAnomaly.detectedAt).toLocaleString()}
                    </p>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CampaignAI;
