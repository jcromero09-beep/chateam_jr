/**
 * CampaignAI — Fase 4: IA Avanzada para Meta Ads
 *
 * Página con 4 pestañas:
 * 1. 🔍 Diagnóstico Profundo — Análisis de 6 tipos de problemas por campaña
 * 2. ✍️ Generador de Copy   — Copy optimizado por nivel de conciencia (Eugene Schwartz)
 * 3. 📊 Score de Creativo   — Scoring predictivo 0-100 antes de lanzar
 * 4. 🚨 Anomalías           — Detección estadística (Z-Score + IQR)
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Box, Typography, Tabs, TabList, Tab, Card, CardContent, Button, IconButton,
  Chip, CircularProgress, Alert, Stack, Divider, LinearProgress,
  Select, Option, Textarea, Input, FormControl, FormLabel,
  Modal, ModalDialog, DialogTitle, DialogContent,
  Badge, Tooltip, List, ListItem, ListItemContent
} from "@mui/joy";
import {
  Psychology as PsychologyIcon,
  Edit as EditIcon,
  BarChart as BarChartIcon,
  Warning as WarningIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  TipsAndUpdates as TipsIcon,
  Campaign as CampaignIcon,
  ContentCopy as CopyIcon,
  Star as StarIcon,
  Close as CloseIcon,
  Add as AddIcon
} from "@mui/icons-material";
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

const getSeverityColor = (severity: string): "danger" | "warning" | "success" | "neutral" => {
  switch (severity) {
    case "critical": return "danger";
    case "high": case "warning": return "warning";
    case "medium": case "low": return "success";
    default: return "neutral";
  }
};

const getScoreColor = (score: number): "danger" | "warning" | "success" | "primary" => {
  if (score >= 80) return "success";
  if (score >= 60) return "primary";
  if (score >= 40) return "warning";
  return "danger";
};

const FACTOR_LABELS: Record<string, string> = {
  hookStrength: "Fortaleza del Hook",
  headlineClarity: "Claridad del Titular",
  ctaEffectiveness: "Efectividad del CTA",
  emotionalTrigger: "Gatillo Emocional",
  audienceAlignment: "Alineación con Audiencia"
};

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
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: "auto" }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={2} mb={3}>
        <PsychologyIcon sx={{ fontSize: 36, color: "primary.500" }} />
        <Box>
          <Typography level="h3" fontWeight="bold">IA Avanzada para Meta Ads</Typography>
          <Typography level="body-sm" color="neutral">
            Diagnóstico inteligente, generación de copy, scoring predictivo y detección de anomalías
          </Typography>
        </Box>
      </Stack>

      {/* Tabs */}
      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v as number)} sx={{ mb: 3 }}>
        <TabList>
          <Tab sx={{ display: "flex", alignItems: "center", gap: 0.5 }}><PsychologyIcon sx={{ fontSize: 18 }} />Diagnóstico</Tab>
          <Tab sx={{ display: "flex", alignItems: "center", gap: 0.5 }}><EditIcon sx={{ fontSize: 18 }} />Generador de Copy</Tab>
          <Tab sx={{ display: "flex", alignItems: "center", gap: 0.5 }}><BarChartIcon sx={{ fontSize: 18 }} />Score de Creativo</Tab>
          <Tab sx={{ display: "flex", alignItems: "center", gap: 0.5 }}><WarningIcon sx={{ fontSize: 18 }} />Anomalías</Tab>
        </TabList>
      </Tabs>

      {/* ══════════════════════════════════════════════════════ */}
      {/* TAB 1: DIAGNÓSTICO PROFUNDO */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeTab === 0 && (
        <Box>
          <Typography level="title-lg" mb={2}>🔍 Diagnóstico Profundo de Campaña</Typography>
          <Typography level="body-sm" color="neutral" mb={3}>
            Analiza 6 tipos de problemas: fatiga creativa, saturación de audiencia, competencia en subasta,
            fase de aprendizaje bloqueada, restricción de presupuesto y desajuste de placements.
          </Typography>

          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent>
              <Stack spacing={2}>
                <FormControl>
                  <FormLabel>Selecciona una campaña</FormLabel>
                  <Select
                    placeholder={loadingCampaigns ? "Cargando campañas..." : "Elige una campaña para diagnosticar"}
                    value={diagCampaignId}
                    onChange={(_, v) => setDiagCampaignId(String(v || ""))}
                    disabled={loadingCampaigns}
                  >
                    {campaigns.map(c => (
                      <Option key={c.id} value={c.id}>
                        {c.name} {c.impressions ? `(${Number(c.impressions).toLocaleString()} impresiones)` : ""}
                      </Option>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  onClick={runDiagnosis}
                  disabled={!diagCampaignId || diagLoading}
                  loading={diagLoading}
                  startDecorator={<PsychologyIcon />}
                  sx={{ alignSelf: "flex-start" }}
                >
                  {diagLoading ? "Analizando con IA..." : "Ejecutar Diagnóstico"}
                </Button>
              </Stack>
            </CardContent>
          </Card>

          {diagError && <Alert color="danger" sx={{ mb: 2 }}>{diagError}</Alert>}

          {diagResult && (
            <Box>
              {/* Salud General */}
              <Card
                variant="soft"
                color={diagResult.overallHealth === "critical" ? "danger" : diagResult.overallHealth === "warning" ? "warning" : "success"}
                sx={{ mb: 3 }}
              >
                <CardContent>
                  <Stack direction="row" alignItems="center" spacing={2}>
                    {diagResult.overallHealth === "critical" ? <ErrorIcon /> : diagResult.overallHealth === "warning" ? <WarningIcon /> : <CheckIcon />}
                    <Box>
                      <Typography level="title-md" fontWeight="bold">
                        Campaña: {diagResult.campaignName}
                      </Typography>
                      <Typography level="body-sm">
                        Salud general: <strong>{diagResult.overallHealth === "critical" ? "🔴 Crítica" : diagResult.overallHealth === "warning" ? "🟡 Advertencia" : "🟢 Buena"}</strong>
                        {" · "}Tokens usados: {diagResult.tokensUsed}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>

              {/* Lista de diagnósticos */}
              <Stack spacing={2}>
                {diagResult.diagnoses.map((d) => {
                  const meta = DIAGNOSIS_LABELS[d.type] || { label: d.type, icon: "🔍" };
                  return (
                    <Card key={d.type} variant="outlined">
                      <CardContent>
                        <Stack direction="row" alignItems="flex-start" spacing={2}>
                          <Typography sx={{ fontSize: 28 }}>{meta.icon}</Typography>
                          <Box flex={1}>
                            <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                              <Typography level="title-sm" fontWeight="bold">{meta.label}</Typography>
                              <Chip
                                size="sm"
                                color={d.detected ? getSeverityColor(d.severity) : "neutral"}
                                variant="soft"
                              >
                                {d.detected ? d.severity.toUpperCase() : "OK"}
                              </Chip>
                            </Stack>

                            {d.detected && d.impact && (
                              <Typography level="body-sm" color="danger" mb={1}>
                                {d.impact}
                              </Typography>
                            )}

                            {!d.detected && (
                              <Typography level="body-sm" color="success">
                                ✅ No se detectaron problemas de este tipo
                              </Typography>
                            )}

                            {d.detected && d.recommendations.length > 0 && (
                              <Box mt={1}>
                                <Typography level="body-xs" fontWeight="bold" color="neutral" mb={0.5}>
                                  Recomendaciones:
                                </Typography>
                                {d.recommendations.map((r, i) => (
                                  <Typography key={i} level="body-xs" startDecorator="→" sx={{ display: "flex", gap: 0.5 }}>
                                    {r}
                                  </Typography>
                                ))}
                              </Box>
                            )}

                            {/* Evidencia */}
                            {d.detected && Object.keys(d.evidence || {}).length > 0 && (
                              <Stack direction="row" spacing={1} flexWrap="wrap" mt={1}>
                                {Object.entries(d.evidence).map(([k, v]) => (
                                  <Chip key={k} size="sm" variant="outlined" color="neutral">
                                    {k}: {typeof v === "number" ? v.toFixed(2) : String(v)}
                                  </Chip>
                                ))}
                              </Stack>
                            )}
                          </Box>
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
              </Stack>
            </Box>
          )}
        </Box>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* TAB 2: GENERADOR DE COPY */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeTab === 1 && (
        <Box>
          <Typography level="title-lg" mb={1}>✍️ Generador de Copy para Meta Ads</Typography>
          <Typography level="body-sm" color="neutral" mb={3}>
            Genera copy optimizado usando el framework de los 5 niveles de conciencia de Eugene Schwartz.
          </Typography>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
            {/* Formulario */}
            <Card variant="outlined">
              <CardContent>
                <Typography level="title-sm" mb={2}>📝 Datos del producto</Typography>
                <Stack spacing={2}>
                  <FormControl required>
                    <FormLabel>Nombre del producto/servicio</FormLabel>
                    <Input
                      placeholder="Ej: Curso de Marketing Digital"
                      value={copyForm.productName}
                      onChange={e => setCopyForm(f => ({ ...f, productName: e.target.value }))}
                    />
                  </FormControl>

                  <FormControl required>
                    <FormLabel>Descripción del producto</FormLabel>
                    <Textarea
                      minRows={2}
                      placeholder="¿Qué hace? ¿Qué problema resuelve? ¿Cuál es el precio?"
                      value={copyForm.productDescription}
                      onChange={e => setCopyForm(f => ({ ...f, productDescription: e.target.value }))}
                    />
                  </FormControl>

                  <FormControl required>
                    <FormLabel>Audiencia objetivo</FormLabel>
                    <Textarea
                      minRows={2}
                      placeholder="Ej: Emprendedores de 25-45 años que quieren generar ingresos online..."
                      value={copyForm.targetAudience}
                      onChange={e => setCopyForm(f => ({ ...f, targetAudience: e.target.value }))}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Propuesta de valor única</FormLabel>
                    <Input
                      placeholder="¿Qué te hace diferente de la competencia?"
                      value={copyForm.uniqueValueProposition}
                      onChange={e => setCopyForm(f => ({ ...f, uniqueValueProposition: e.target.value }))}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Industria</FormLabel>
                    <Input
                      placeholder="Ej: Educación online, Salud, E-commerce..."
                      value={copyForm.industry}
                      onChange={e => setCopyForm(f => ({ ...f, industry: e.target.value }))}
                    />
                  </FormControl>

                  <FormControl required>
                    <FormLabel>🧠 Nivel de conciencia del usuario</FormLabel>
                    <Select value={copyForm.consciousnessLevel} onChange={(_, v) => setCopyForm(f => ({ ...f, consciousnessLevel: String(v) }))}>
                      {(copyMeta?.consciousnessLevels || [
                        { value: "unaware", label: "Sin conciencia" },
                        { value: "problem_aware", label: "Consciente del problema" },
                        { value: "solution_aware", label: "Consciente de la solución" },
                        { value: "product_aware", label: "Consciente del producto" },
                        { value: "most_aware", label: "Listo para comprar" }
                      ]).map(l => (
                        <Option key={l.value} value={l.value}>{l.label}</Option>
                      ))}
                    </Select>
                    {copyMeta && (
                      <Typography level="body-xs" color="neutral" mt={0.5}>
                        {copyMeta.consciousnessLevels.find(l => l.value === copyForm.consciousnessLevel)?.description}
                      </Typography>
                    )}
                  </FormControl>

                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                    <FormControl>
                      <FormLabel>Tono</FormLabel>
                      <Select value={copyForm.tone} onChange={(_, v) => setCopyForm(f => ({ ...f, tone: String(v) }))}>
                        {(copyMeta?.tones || [
                          { value: "professional", label: "Profesional" },
                          { value: "casual", label: "Casual" },
                          { value: "urgent", label: "Urgente" }
                        ]).map(t => (
                          <Option key={t.value} value={t.value}>{t.label}</Option>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl>
                      <FormLabel>Objetivo</FormLabel>
                      <Select value={copyForm.objective} onChange={(_, v) => setCopyForm(f => ({ ...f, objective: String(v) }))}>
                        {(copyMeta?.objectives || [
                          { value: "SALES", label: "Ventas" },
                          { value: "LEADS", label: "Leads" },
                          { value: "TRAFFIC", label: "Tráfico" }
                        ]).map(o => (
                          <Option key={o.value} value={o.value}>{o.label}</Option>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>

                  <FormControl>
                    <FormLabel>Número de variaciones (1-5)</FormLabel>
                    <Select value={copyForm.variationsCount} onChange={(_, v) => setCopyForm(f => ({ ...f, variationsCount: Number(v) }))}>
                      {[1, 2, 3, 4, 5].map(n => <Option key={n} value={n}>{n} variación{n > 1 ? "es" : ""}</Option>)}
                    </Select>
                  </FormControl>

                  {copyError && <Alert color="danger">{copyError}</Alert>}

                  <Button
                    onClick={generateCopy}
                    disabled={!copyForm.productName || !copyForm.productDescription || !copyForm.targetAudience || copyLoading}
                    loading={copyLoading}
                    startDecorator={<EditIcon />}
                    fullWidth
                  >
                    {copyLoading ? "Generando con IA..." : "Generar Copy"}
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            {/* Resultados */}
            <Box>
              {!copyResult && !copyLoading && (
                <Card variant="soft" color="neutral" sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CardContent sx={{ textAlign: "center" }}>
                    <EditIcon sx={{ fontSize: 48, color: "neutral.400", mb: 1 }} />
                    <Typography level="body-md" color="neutral">
                      Las variaciones de copy aparecerán aquí
                    </Typography>
                  </CardContent>
                </Card>
              )}

              {copyResult && (
                <Stack spacing={2}>
                  <Typography level="body-sm" color="neutral">
                    {copyResult.variations.length} variaciones generadas · {copyResult.tokensUsed} tokens usados
                  </Typography>

                  {copyResult.variations.map((v, idx) => (
                    <Card key={v.id} variant="outlined">
                      <CardContent>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1}>
                          <Typography level="title-sm" fontWeight="bold">Variación {idx + 1}</Typography>
                          <Stack direction="row" spacing={0.5}>
                            {v.psychologicalTriggers?.slice(0, 2).map(t => (
                              <Chip key={t} size="sm" variant="soft" color="primary">{t}</Chip>
                            ))}
                          </Stack>
                        </Stack>

                        <Stack spacing={1.5}>
                          <Box>
                            <Typography level="body-xs" fontWeight="bold" color="neutral">HOOK (apertura)</Typography>
                            <Typography level="body-sm" sx={{ fontStyle: "italic" }}>"{v.hook}"</Typography>
                          </Box>

                          <Divider />

                          <Box>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Typography level="body-xs" fontWeight="bold" color="neutral">TITULAR (headline)</Typography>
                              <IconButton
                                size="sm"
                                variant="soft"
                                onClick={() => copyToClipboard(v.headline, `h_${idx}`)}
                              >
                                {copiedId === `h_${idx}` ? <CheckIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
                              </IconButton>
                            </Stack>
                            <Typography level="body-md" fontWeight="bold">{v.headline}</Typography>
                          </Box>

                          <Box>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Typography level="body-xs" fontWeight="bold" color="neutral">TEXTO PRINCIPAL</Typography>
                              <IconButton
                                size="sm"
                                variant="soft"
                                onClick={() => copyToClipboard(v.primaryText, `p_${idx}`)}
                              >
                                {copiedId === `p_${idx}` ? <CheckIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
                              </IconButton>
                            </Stack>
                            <Typography level="body-sm">{v.primaryText}</Typography>
                          </Box>

                          <Stack direction="row" spacing={1} alignItems="center">
                            <Chip size="sm" variant="solid" color="primary">{v.cta}</Chip>
                            <Typography level="body-xs" color="neutral">{v.approach}</Typography>
                          </Stack>

                          <Button
                            size="sm"
                            variant="soft"
                            startDecorator={<CopyIcon />}
                            onClick={() => copyToClipboard(
                              `Hook: ${v.hook}\n\nTitular: ${v.headline}\n\nTexto: ${v.primaryText}\n\nDescripción: ${v.description}\n\nCTA: ${v.cta}`,
                              `all_${idx}`
                            )}
                          >
                            {copiedId === `all_${idx}` ? "✓ Copiado" : "Copiar todo"}
                          </Button>
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* TAB 3: SCORE DE CREATIVO */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeTab === 2 && (
        <Box>
          <Typography level="title-lg" mb={1}>📊 Score Predictivo de Creativo</Typography>
          <Typography level="body-sm" color="neutral" mb={3}>
            Predice el rendimiento de tu creativo ANTES de lanzarlo. Score 0-100 con 5 factores ponderados.
          </Typography>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
            {/* Formulario */}
            <Card variant="outlined">
              <CardContent>
                <Typography level="title-sm" mb={2}>📝 Contenido del creativo</Typography>
                <Stack spacing={2}>
                  <FormControl required>
                    <FormLabel>Titular (headline)</FormLabel>
                    <Input
                      placeholder="Max 40 caracteres"
                      value={scoreForm.headline}
                      onChange={e => setScoreForm(f => ({ ...f, headline: e.target.value }))}
                    />
                    <Typography level="body-xs" color={scoreForm.headline.length > 40 ? "danger" : "neutral"}>
                      {scoreForm.headline.length}/40 caracteres
                    </Typography>
                  </FormControl>

                  <FormControl required>
                    <FormLabel>Texto principal (primary text)</FormLabel>
                    <Textarea
                      minRows={3}
                      placeholder="Escribe el cuerpo del anuncio..."
                      value={scoreForm.primaryText}
                      onChange={e => setScoreForm(f => ({ ...f, primaryText: e.target.value }))}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Descripción (link description)</FormLabel>
                    <Input
                      placeholder="Max 30 caracteres"
                      value={scoreForm.description}
                      onChange={e => setScoreForm(f => ({ ...f, description: e.target.value }))}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel>Botón CTA</FormLabel>
                    <Input
                      placeholder="Ej: Comprar ahora, Más información, Registrarse..."
                      value={scoreForm.cta}
                      onChange={e => setScoreForm(f => ({ ...f, cta: e.target.value }))}
                    />
                  </FormControl>

                  <FormControl required>
                    <FormLabel>Audiencia objetivo</FormLabel>
                    <Textarea
                      minRows={2}
                      placeholder="Describe tu audiencia objetivo..."
                      value={scoreForm.targetAudience}
                      onChange={e => setScoreForm(f => ({ ...f, targetAudience: e.target.value }))}
                    />
                  </FormControl>

                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                    <FormControl required>
                      <FormLabel>Objetivo</FormLabel>
                      <Select value={scoreForm.objective} onChange={(_, v) => setScoreForm(f => ({ ...f, objective: String(v) }))}>
                        <Option value="SALES">Ventas</Option>
                        <Option value="LEADS">Leads</Option>
                        <Option value="TRAFFIC">Tráfico</Option>
                        <Option value="AWARENESS">Reconocimiento</Option>
                        <Option value="ENGAGEMENT">Interacción</Option>
                      </Select>
                    </FormControl>

                    <FormControl>
                      <FormLabel>Industria</FormLabel>
                      <Input
                        placeholder="Ej: E-commerce"
                        value={scoreForm.industry}
                        onChange={e => setScoreForm(f => ({ ...f, industry: e.target.value }))}
                      />
                    </FormControl>
                  </Box>

                  <FormControl>
                    <FormLabel>Descripción del visual (opcional)</FormLabel>
                    <Textarea
                      minRows={2}
                      placeholder="Describe la imagen o video que acompaña el anuncio..."
                      value={scoreForm.imageDescription}
                      onChange={e => setScoreForm(f => ({ ...f, imageDescription: e.target.value }))}
                    />
                  </FormControl>

                  {scoreError && <Alert color="danger">{scoreError}</Alert>}

                  <Button
                    onClick={scoreCreative}
                    disabled={!scoreForm.headline || !scoreForm.primaryText || !scoreForm.targetAudience || scoreLoading}
                    loading={scoreLoading}
                    startDecorator={<BarChartIcon />}
                    fullWidth
                  >
                    {scoreLoading ? "Calculando score..." : "Calcular Score Predictivo"}
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            {/* Resultados */}
            <Box>
              {!scoreResult && !scoreLoading && (
                <Card variant="soft" color="neutral" sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CardContent sx={{ textAlign: "center" }}>
                    <BarChartIcon sx={{ fontSize: 48, color: "neutral.400", mb: 1 }} />
                    <Typography level="body-md" color="neutral">
                      El análisis del creativo aparecerá aquí
                    </Typography>
                  </CardContent>
                </Card>
              )}

              {scoreResult && (
                <Stack spacing={2}>
                  {/* Score general */}
                  <Card variant="soft" color={getScoreColor(scoreResult.overallScore)}>
                    <CardContent>
                      <Stack direction="row" alignItems="center" spacing={3}>
                        <Box sx={{ position: "relative", display: "inline-flex" }}>
                          <CircularProgress
                            determinate
                            value={scoreResult.overallScore}
                            size="lg"
                            sx={{ "--CircularProgress-size": "80px" }}
                            color={getScoreColor(scoreResult.overallScore)}
                          />
                          <Box sx={{
                            top: 0, left: 0, bottom: 0, right: 0, position: "absolute",
                            display: "flex", alignItems: "center", justifyContent: "center"
                          }}>
                            <Typography level="title-lg" fontWeight="bold">{scoreResult.overallScore}</Typography>
                          </Box>
                        </Box>
                        <Box>
                          <Stack direction="row" spacing={1} mb={0.5}>
                            <Chip size="lg" variant="solid" color={getScoreColor(scoreResult.overallScore)}>
                              Grado {scoreResult.grade}
                            </Chip>
                          </Stack>
                          <Typography level="body-sm">{scoreResult.prediction}</Typography>
                          <Typography level="body-xs" color="neutral" mt={0.5}>{scoreResult.tokensUsed} tokens usados</Typography>
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>

                  {/* Factores */}
                  <Card variant="outlined">
                    <CardContent>
                      <Typography level="title-sm" mb={2}>Desglose por factores</Typography>
                      <Stack spacing={1.5}>
                        {Object.entries(scoreResult.factors).map(([key, factor]) => (
                          <Box key={key}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                              <Typography level="body-sm">{FACTOR_LABELS[key] || key}</Typography>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Chip size="sm" variant="soft" color={getScoreColor(factor.score)}>{factor.grade}</Chip>
                                <Typography level="body-sm" fontWeight="bold">{factor.score}/100</Typography>
                              </Stack>
                            </Stack>
                            <LinearProgress
                              determinate
                              value={factor.score}
                              color={getScoreColor(factor.score)}
                              size="sm"
                            />
                            <Typography level="body-xs" color="neutral" mt={0.3}>{factor.feedback}</Typography>
                          </Box>
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>

                  {/* Fortalezas y problemas */}
                  {scoreResult.topStrengths.length > 0 && (
                    <Card variant="soft" color="success">
                      <CardContent>
                        <Typography level="title-sm" mb={1}>✅ Fortalezas</Typography>
                        {scoreResult.topStrengths.map((s, i) => (
                          <Typography key={i} level="body-sm" startDecorator="→" sx={{ display: "flex", gap: 0.5 }}>{s}</Typography>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {scoreResult.criticalIssues.length > 0 && (
                    <Card variant="soft" color="danger">
                      <CardContent>
                        <Typography level="title-sm" mb={1}>❌ Problemas críticos</Typography>
                        {scoreResult.criticalIssues.map((s, i) => (
                          <Typography key={i} level="body-sm" startDecorator="→" sx={{ display: "flex", gap: 0.5 }}>{s}</Typography>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {scoreResult.quickWins.length > 0 && (
                    <Card variant="soft" color="warning">
                      <CardContent>
                        <Typography level="title-sm" mb={1}>⚡ Quick wins</Typography>
                        {scoreResult.quickWins.map((s, i) => (
                          <Typography key={i} level="body-sm" startDecorator="→" sx={{ display: "flex", gap: 0.5 }}>{s}</Typography>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                  {scoreResult.benchmarkComparison && (
                    <Alert color="neutral">
                      <Typography level="body-sm">{scoreResult.benchmarkComparison}</Typography>
                    </Alert>
                  )}
                </Stack>
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* TAB 4: ANOMALÍAS */}
      {/* ══════════════════════════════════════════════════════ */}
      {activeTab === 3 && (
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={2} flexWrap="wrap" gap={2}>
            <Box>
              <Typography level="title-lg">🚨 Detección de Anomalías</Typography>
              <Typography level="body-sm" color="neutral">
                Detecta comportamientos estadísticamente inusuales (Z-Score + IQR) en tus campañas.
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} alignItems="center">
              <Select
                size="sm"
                value={anomalyPeriod}
                onChange={(_, v) => setAnomalyPeriod(String(v))}
                sx={{ minWidth: 160 }}
              >
                <Option value="last_7_days">Últimos 7 días</Option>
                <Option value="last_14_days">Últimos 14 días</Option>
                <Option value="last_30_days">Últimos 30 días</Option>
              </Select>
              <Button
                onClick={detectAnomalies}
                loading={anomalyLoading}
                startDecorator={<RefreshIcon />}
                variant="solid"
              >
                Detectar Anomalías
              </Button>
            </Stack>
          </Stack>

          {anomalyError && <Alert color="danger" sx={{ mb: 2 }}>{anomalyError}</Alert>}

          {!anomalyResult && !anomalyLoading && (
            <Card variant="soft" color="neutral">
              <CardContent sx={{ textAlign: "center", py: 4 }}>
                <WarningIcon sx={{ fontSize: 48, color: "neutral.400", mb: 1 }} />
                <Typography level="body-md" color="neutral">
                  Haz clic en "Detectar Anomalías" para analizar tus campañas
                </Typography>
              </CardContent>
            </Card>
          )}

          {anomalyResult && (
            <Box>
              {/* Resumen */}
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 2, mb: 3 }}>
                {[
                  { label: "Campañas analizadas", value: anomalyResult.totalCampaigns, color: "primary" },
                  { label: "Anomalías encontradas", value: anomalyResult.anomaliesFound, color: anomalyResult.anomaliesFound > 0 ? "warning" : "success" },
                  { label: "Críticas", value: anomalyResult.critical, color: anomalyResult.critical > 0 ? "danger" : "success" },
                  { label: "Advertencias", value: anomalyResult.warnings, color: anomalyResult.warnings > 0 ? "warning" : "success" }
                ].map(stat => (
                  <Card key={stat.label} variant="soft" color={stat.color as any}>
                    <CardContent sx={{ textAlign: "center", py: 1.5 }}>
                      <Typography level="h3" fontWeight="bold">{stat.value}</Typography>
                      <Typography level="body-xs">{stat.label}</Typography>
                    </CardContent>
                  </Card>
                ))}
              </Box>

              <Alert color={anomalyResult.critical > 0 ? "danger" : anomalyResult.warnings > 0 ? "warning" : "success"} sx={{ mb: 3 }}>
                {anomalyResult.summary}
              </Alert>

              {/* Lista de anomalías */}
              {anomalyResult.anomalies.length === 0 ? (
                <Card variant="soft" color="success">
                  <CardContent sx={{ textAlign: "center", py: 3 }}>
                    <CheckIcon sx={{ fontSize: 40, color: "success.500", mb: 1 }} />
                    <Typography level="title-md">✅ Todas las campañas están dentro de rangos normales</Typography>
                  </CardContent>
                </Card>
              ) : (
                <Stack spacing={2}>
                  {anomalyResult.anomalies.map((anomaly, idx) => (
                    <Card
                      key={`${anomaly.campaignId}_${anomaly.metric}_${idx}`}
                      variant="outlined"
                      sx={{ cursor: "pointer", "&:hover": { boxShadow: "sm" } }}
                      onClick={() => setSelectedAnomaly(anomaly)}
                    >
                      <CardContent>
                        <Stack direction="row" alignItems="flex-start" spacing={2}>
                          <Chip
                            size="sm"
                            variant="solid"
                            color={getSeverityColor(anomaly.severity)}
                          >
                            {anomaly.severity === "critical" ? "CRÍTICO" : "AVISO"}
                          </Chip>
                          <Box flex={1}>
                            <Typography level="body-sm" fontWeight="bold">{anomaly.description}</Typography>
                            <Stack direction="row" spacing={2} mt={1} flexWrap="wrap">
                              <Typography level="body-xs" color="neutral">
                                Campaña: <strong>{anomaly.campaignName}</strong>
                              </Typography>
                              <Typography level="body-xs" color="neutral">
                                Métrica: <strong>{anomaly.metricLabel}</strong>
                              </Typography>
                              <Typography level="body-xs" color={anomaly.deviation > 0 ? "danger" : "success"}>
                                Desviación: <strong>{anomaly.deviation > 0 ? "+" : ""}{anomaly.deviation.toFixed(1)}%</strong>
                              </Typography>
                              <Chip size="sm" variant="outlined" color="neutral">{anomaly.algorithm}</Chip>
                            </Stack>
                          </Box>
                          <TipsIcon sx={{ color: "warning.500", flexShrink: 0 }} />
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Stack>
              )}
            </Box>
          )}

          {/* Modal de detalle de anomalía */}
          <Modal open={!!selectedAnomaly} onClose={() => setSelectedAnomaly(null)}>
            <ModalDialog sx={{ maxWidth: 560 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <DialogTitle>Detalle de Anomalía</DialogTitle>
                <IconButton variant="soft" onClick={() => setSelectedAnomaly(null)}>
                  <CloseIcon />
                </IconButton>
              </Stack>
              <Divider />
              <DialogContent>
                {selectedAnomaly && (
                  <Stack spacing={2}>
                    <Chip variant="solid" color={getSeverityColor(selectedAnomaly.severity)}>
                      {selectedAnomaly.severity.toUpperCase()}
                    </Chip>

                    <Typography level="body-md">{selectedAnomaly.description}</Typography>

                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 2 }}>
                      {[
                        { label: "Valor actual", value: selectedAnomaly.currentValue.toFixed(2) },
                        { label: "Promedio histórico", value: selectedAnomaly.historicalAvg.toFixed(2) },
                        { label: "Desviación", value: `${selectedAnomaly.deviation > 0 ? "+" : ""}${selectedAnomaly.deviation.toFixed(1)}%` }
                      ].map(stat => (
                        <Card key={stat.label} variant="soft" size="sm">
                          <CardContent sx={{ textAlign: "center" }}>
                            <Typography level="title-md" fontWeight="bold">{stat.value}</Typography>
                            <Typography level="body-xs" color="neutral">{stat.label}</Typography>
                          </CardContent>
                        </Card>
                      ))}
                    </Box>

                    <Alert color="warning" startDecorator={<TipsIcon />}>
                      <Typography level="body-sm">{selectedAnomaly.suggestion}</Typography>
                    </Alert>

                    <Typography level="body-xs" color="neutral">
                      Algoritmo: {selectedAnomaly.algorithm} · Detectado: {new Date(selectedAnomaly.detectedAt).toLocaleString()}
                    </Typography>
                  </Stack>
                )}
              </DialogContent>
            </ModalDialog>
          </Modal>
        </Box>
      )}
    </Box>
  );
};

export default CampaignAI;
