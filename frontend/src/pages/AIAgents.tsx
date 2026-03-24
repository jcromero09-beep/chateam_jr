/**
 * Pagina: AIAgents
 * Agentes de IA — catalogo por departamentos, contratacion y observabilidad.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert,
  IconButton,
  Button,
  Chip,
  Divider,
  Badge,
  Input,
  Tabs,
  TabList,
  Tab,
  Sheet,
  Dropdown,
  MenuButton,
  Menu,
  MenuItem,
} from '@mui/joy';
import {
  Bot,
  UserCheck,
  UserMinus,
  UserPlus,
  X,
  RefreshCw,
  Activity,
  Clock,
  AlertTriangle as AlertTriangleIcon,
  ToggleLeft,
  ToggleRight,
  Thermometer,
  Cpu,
  Search,
  Headphones,
  TrendingUp,
  Megaphone,
  BookOpen,
  Zap,
  BarChart3,
  Image,
  Shield,
  Brain,
  Globe,
  Star,
  FileText,
  Mic,
  Video,
  Eye,
  Layout,
  Lock,
  Mail,
  Calendar,
  PenLine,
  Target,
  DollarSign,
  GitBranch,
  Timer,
  Plug,
  Heart,
  Calculator,
  Sparkles,
  FileBarChart,
  ShieldCheck,
  ShieldAlert,
  FileScan,
  Library,
  Workflow,
  MoreHorizontal,
  ClipboardList,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import api from '../services/api';

// Helpers de logging para desarrollo
const isDev = import.meta.env.DEV;
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args); };
const devError = (...args: unknown[]) => { if (isDev) console.error(...args); };

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type AgentType = 'router' | 'rag' | 'support' | 'sales' | 'escalation' | 'supervisor'
  | 'content' | 'analytics' | 'multimedia' | 'security' | 'automation' | 'research';

type AgentDepartment = 'customer_service' | 'sales_crm' | 'marketing' | 'knowledge_rag'
  | 'automation' | 'analytics_bi' | 'multimedia' | 'security' | 'product_management';

type AgentTier = 'nano' | 'mini' | 'full' | 'premium';

type JoyColor = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

interface AgentConfig {
  id: number;
  name: string;
  agentType: AgentType;
  modelKey: string;
  temperature: number;
  maxTokens: number;
  isActive: boolean;
  description?: string;
  department?: AgentDepartment;
  category?: string;
  capabilities?: string[];
  icon?: string;
  tier?: AgentTier;
  slug?: string;
  sortOrder?: number;
  version?: string;
  // Aliases del frontend legacy
  type?: AgentType;
  model?: string;
  enabled?: boolean;
}

interface AgentAssignment {
  id: number;
  agentConfigId: number;
  agentConfig?: AgentConfig;
  assignedAt: string;
}

interface AgentObservabilityStats {
  agentConfigId: number;
  totalCalls: number;
  avgLatency: number;
  errorRate: number;
}

interface AssignmentsResponse {
  data?: AgentAssignment[];
  assignments?: AgentAssignment[];
  maxAgents?: number;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const AGENT_TYPE_LABELS: Record<string, string> = {
  router: 'Enrutador',
  rag: 'RAG',
  support: 'Soporte',
  sales: 'Ventas',
  escalation: 'Escalacion',
  supervisor: 'Supervisor',
  content: 'Contenido',
  analytics: 'Analisis',
  multimedia: 'Multimedia',
  security: 'Seguridad',
  automation: 'Automatizacion',
  research: 'Investigacion',
};

const AGENT_TYPE_COLORS: Record<string, JoyColor> = {
  router: 'primary',
  rag: 'success',
  support: 'warning',
  sales: 'neutral',
  escalation: 'danger',
  supervisor: 'primary',
  content: 'success',
  analytics: 'warning',
  multimedia: 'neutral',
  security: 'danger',
  automation: 'primary',
  research: 'success',
};

interface DepartmentInfo {
  label: string;
  icon: LucideIcon;
  color: JoyColor;
  description: string;
}

const DEPARTMENTS: Record<AgentDepartment, DepartmentInfo> = {
  customer_service: { label: 'Atencion al Cliente', icon: Headphones, color: 'primary', description: 'Soporte, FAQ, escalacion y satisfaccion' },
  sales_crm:        { label: 'Ventas y CRM',       icon: TrendingUp, color: 'success', description: 'Pipeline, leads, cotizaciones y seguimiento' },
  marketing:        { label: 'Marketing',           icon: Megaphone,  color: 'warning', description: 'Redaccion, SEO, redes sociales y campanas' },
  knowledge_rag:    { label: 'Conocimiento & RAG',  icon: BookOpen,   color: 'neutral', description: 'Documentos, investigacion y base de conocimiento' },
  automation:       { label: 'Automatizacion',      icon: Zap,        color: 'primary', description: 'Routing, flujos, tareas e integraciones' },
  analytics_bi:     { label: 'Analisis & BI',       icon: BarChart3,  color: 'success', description: 'Datos, reportes, KPIs y sentimiento' },
  multimedia:       { label: 'Multimedia',           icon: Image,      color: 'warning', description: 'Imagenes, audio, video y presentaciones' },
  security:         { label: 'Seguridad',            icon: Shield,     color: 'danger',  description: 'Moderacion, spam, privacidad y amenazas' },
  product_management: { label: 'Producto',           icon: ClipboardList, color: 'primary', description: 'PRD, user stories, roadmap y feedback' },
};

const DEPARTMENT_ORDER: AgentDepartment[] = [
  'customer_service', 'sales_crm', 'marketing', 'knowledge_rag',
  'automation', 'analytics_bi', 'multimedia', 'security', 'product_management',
];

interface CapabilityInfo { label: string; color: JoyColor }

const CAPABILITIES: Record<string, CapabilityInfo> = {
  memory:              { label: 'Memoria',        color: 'primary' },
  rag:                 { label: 'RAG',             color: 'success' },
  web_search:          { label: 'Web',             color: 'warning' },
  knowledge_base:      { label: 'Base Conocim.',   color: 'success' },
  escalation:          { label: 'Escalacion',      color: 'danger' },
  sentiment_analysis:  { label: 'Sentimiento',     color: 'danger' },
  multi_language:      { label: 'Multiidioma',     color: 'primary' },
  lead_scoring:        { label: 'Lead Scoring',    color: 'success' },
  pipeline_management: { label: 'Pipeline',        color: 'neutral' },
  text_generation:     { label: 'Generacion',      color: 'primary' },
  brand_voice:         { label: 'Marca',           color: 'warning' },
  seo:                 { label: 'SEO',             color: 'success' },
  file_processing:     { label: 'Archivos',        color: 'neutral' },
  summarization:       { label: 'Resumen',         color: 'primary' },
  audio_processing:    { label: 'Audio',           color: 'warning' },
  classification:      { label: 'Clasificacion',   color: 'primary' },
  routing:             { label: 'Routing',         color: 'primary' },
  orchestration:       { label: 'Orquestacion',    color: 'neutral' },
  scheduling:          { label: 'Programacion',    color: 'warning' },
  api_integration:     { label: 'APIs',            color: 'neutral' },
  data_analysis:       { label: 'Analisis Datos',  color: 'success' },
  visualization:       { label: 'Visualizacion',   color: 'warning' },
  report_generation:   { label: 'Reportes',        color: 'neutral' },
  image_generation:    { label: 'Imagenes',        color: 'warning' },
  video_generation:    { label: 'Videos',          color: 'danger' },
  vision:              { label: 'Vision IA',       color: 'primary' },
  ocr:                 { label: 'OCR',             color: 'neutral' },
  content_moderation:  { label: 'Moderacion',      color: 'danger' },
  spam_detection:      { label: 'Anti-Spam',       color: 'danger' },
  pii_detection:       { label: 'PII',             color: 'danger' },
  source_citation:     { label: 'Fuentes',         color: 'success' },
  ticket_context:      { label: 'Tickets',         color: 'primary' },
  surveys:             { label: 'Encuestas',       color: 'warning' },
  translation:         { label: 'Traduccion',      color: 'primary' },
  crm:                 { label: 'CRM',             color: 'success' },
  qualification:       { label: 'Cualificacion',   color: 'neutral' },
  email:               { label: 'Email',           color: 'warning' },
  social_media:        { label: 'Redes Sociales',  color: 'warning' },
  email_templates:     { label: 'Plantillas',      color: 'neutral' },
  personalization:     { label: 'Personalizacion', color: 'primary' },
  ab_testing:          { label: 'A/B Testing',     color: 'warning' },
  persuasion:          { label: 'Persuasion',      color: 'danger' },
  chunking:            { label: 'Chunking',        color: 'neutral' },
  embeddings:          { label: 'Embeddings',      color: 'success' },
  indexing:            { label: 'Indexacion',       color: 'neutral' },
  extraction:          { label: 'Extraccion',      color: 'primary' },
  transcription:       { label: 'Transcripcion',   color: 'warning' },
  intent_detection:    { label: 'Intenciones',     color: 'primary' },
  monitoring:          { label: 'Monitoreo',       color: 'neutral' },
  delegation:          { label: 'Delegacion',      color: 'primary' },
  workflow_automation: { label: 'Workflows',       color: 'warning' },
  conditional_logic:   { label: 'Logica',          color: 'neutral' },
  triggers:            { label: 'Triggers',        color: 'danger' },
  cron:                { label: 'Cron',            color: 'neutral' },
  task_management:     { label: 'Tareas',          color: 'primary' },
  webhooks:            { label: 'Webhooks',        color: 'neutral' },
  data_mapping:        { label: 'Mapeo',           color: 'warning' },
  sql:                 { label: 'SQL',             color: 'success' },
  export:              { label: 'Exportar',        color: 'neutral' },
  observability:       { label: 'Observabilidad',  color: 'primary' },
  alerts:              { label: 'Alertas',         color: 'danger' },
  metrics:             { label: 'Metricas',        color: 'success' },
  dashboards:          { label: 'Dashboards',      color: 'warning' },
  nlp:                 { label: 'NLP',             color: 'primary' },
  emotion_detection:   { label: 'Emociones',       color: 'danger' },
  cost_optimization:   { label: 'Costos',          color: 'warning' },
  usage_analytics:     { label: 'Uso',             color: 'neutral' },
  recommendations:     { label: 'Recomendaciones', color: 'success' },
  dall_e:              { label: 'DALL-E',          color: 'warning' },
  style_transfer:      { label: 'Estilo',          color: 'neutral' },
  tts:                 { label: 'TTS',             color: 'primary' },
  voice_cloning:       { label: 'Voz',             color: 'warning' },
  heygen:              { label: 'HeyGen',          color: 'danger' },
  avatars:             { label: 'Avatares',        color: 'neutral' },
  image_analysis:      { label: 'Analisis Img',    color: 'primary' },
  templates:           { label: 'Plantillas',      color: 'neutral' },
  formatting:          { label: 'Formato',         color: 'warning' },
  document_generation: { label: 'Documentos',      color: 'neutral' },
  toxicity_detection:  { label: 'Toxicidad',       color: 'danger' },
  compliance:          { label: 'Compliance',      color: 'warning' },
  filtering:           { label: 'Filtrado',        color: 'neutral' },
  gdpr:                { label: 'GDPR',            color: 'danger' },
  data_anonymization:  { label: 'Anonimizacion',   color: 'warning' },
  threat_detection:    { label: 'Amenazas',        color: 'danger' },
  anomaly_detection:   { label: 'Anomalias',       color: 'warning' },
  priority_routing:    { label: 'Prioridad',       color: 'danger' },
  analytics:           { label: 'Analitica',       color: 'success' },
  product_catalog:     { label: 'Catalogo',        color: 'neutral' },
  calculations:        { label: 'Calculos',        color: 'warning' },
  reminders:           { label: 'Recordatorios',   color: 'primary' },
  company_research:    { label: 'Investigacion',   color: 'success' },
  pricing:             { label: 'Precios',         color: 'warning' },
  content_calendar:    { label: 'Calendario',      color: 'neutral' },
  keyword_research:    { label: 'Keywords',        color: 'success' },
  video_ads:           { label: 'Video Ads',       color: 'warning' },
  pattern_interrupt:   { label: 'Pattern Int.',    color: 'danger' },
  creative_hooks:      { label: 'Hooks',           color: 'success' },
  google_workspace:    { label: 'Google WS',       color: 'success' },
};

const TIER_CONFIG: Record<AgentTier, { label: string; color: JoyColor }> = {
  nano:    { label: 'Basico',   color: 'neutral' },
  mini:    { label: 'Estandar', color: 'primary' },
  full:    { label: 'Avanzado', color: 'warning' },
  premium: { label: 'Premium',  color: 'danger' },
};

// Mapa de iconos string -> componente lucide
const ICON_MAP: Record<string, LucideIcon> = {
  'headphones': Headphones,
  'trending-up': TrendingUp,
  'megaphone': Megaphone,
  'book-open': BookOpen,
  'zap': Zap,
  'bar-chart-3': BarChart3,
  'image': Image,
  'shield': Shield,
  'bot': Bot,
  'brain': Brain,
  'search': Search,
  'globe': Globe,
  'star': Star,
  'file-text': FileText,
  'mic': Mic,
  'video': Video,
  'eye': Eye,
  'layout': Layout,
  'lock': Lock,
  'mail': Mail,
  'calendar': Calendar,
  'pen-line': PenLine,
  'target': Target,
  'dollar-sign': DollarSign,
  'git-branch': GitBranch,
  'timer': Timer,
  'plug': Plug,
  'heart-pulse': Heart,
  'calculator': Calculator,
  'sparkles': Sparkles,
  'file-bar-chart': FileBarChart,
  'shield-check': ShieldCheck,
  'shield-alert': ShieldAlert,
  'file-scan': FileScan,
  'library': Library,
  'activity': Activity,
  'alert-triangle': AlertTriangleIcon,
  'workflow': Workflow,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function AgentIcon({ name, size = 20 }: { name?: string; size?: number }) {
  const IconComp = ICON_MAP[name ?? 'bot'] ?? Bot;
  return <IconComp size={size} />;
}

/** Normaliza campos del backend a la interfaz frontend */
function normalizeAgent(raw: Record<string, unknown>): AgentConfig {
  return {
    id: raw.id as number,
    name: raw.name as string,
    agentType: (raw.agentType ?? raw.type ?? 'support') as AgentType,
    modelKey: (raw.modelKey ?? raw.model ?? 'auto') as string,
    temperature: (raw.temperature ?? 0.7) as number,
    maxTokens: (raw.maxTokens ?? 1024) as number,
    isActive: (raw.isActive ?? raw.enabled ?? true) as boolean,
    description: raw.description as string | undefined,
    department: raw.department as AgentDepartment | undefined,
    category: raw.category as string | undefined,
    capabilities: (raw.capabilities ?? []) as string[],
    icon: (raw.icon ?? 'bot') as string,
    tier: (raw.tier ?? 'mini') as AgentTier,
    slug: raw.slug as string | undefined,
    sortOrder: (raw.sortOrder ?? 0) as number,
    version: (raw.version ?? '1.0.0') as string,
    type: (raw.agentType ?? raw.type) as AgentType | undefined,
    model: (raw.modelKey ?? raw.model) as string | undefined,
    enabled: (raw.isActive ?? raw.enabled) as boolean | undefined,
  };
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function AIAgents() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [assignments, setAssignments] = useState<AgentAssignment[]>([]);
  const [maxAgents, setMaxAgents] = useState<number>(5);
  const [observabilityStats, setObservabilityStats] = useState<AgentObservabilityStats[]>([]);

  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [unassigningId, setUnassigningId] = useState<number | null>(null);

  const [activeDepartment, setActiveDepartment] = useState<AgentDepartment | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ---------------------------------------------------------------------------
  // Carga de datos
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [agentsResult, assignmentsResult, obsResult] = await Promise.allSettled([
        api.get('/ai/agents'),
        api.get('/ai/agents/assignments'),
        api.get('/ai/observability/stats/agents'),
      ]);

      // Agentes
      if (agentsResult.status === 'fulfilled') {
        const payload = agentsResult.value.data as unknown;
        const rawList = Array.isArray(payload)
          ? payload
          : ((payload as Record<string, unknown>).data as unknown[] ?? []);
        const list: AgentConfig[] = (rawList as Record<string, unknown>[]).map(normalizeAgent);
        setAgents(list);
        devLog('[AIAgents] Agentes:', list.length);
      } else {
        const reason = agentsResult.reason as { response?: { data?: { error?: string } } };
        devError('[AIAgents] Error al cargar agentes:', agentsResult.reason);
        throw new Error(reason?.response?.data?.error ?? 'Error al cargar agentes');
      }

      // Asignaciones
      if (assignmentsResult.status === 'fulfilled') {
        const payload = assignmentsResult.value.data as unknown as AssignmentsResponse | AgentAssignment[];
        const list: AgentAssignment[] = Array.isArray(payload)
          ? payload
          : ((payload as AssignmentsResponse).data ?? (payload as AssignmentsResponse).assignments ?? []);
        const max: number = (!Array.isArray(payload) && (payload as AssignmentsResponse).maxAgents)
          ? ((payload as AssignmentsResponse).maxAgents as number)
          : 5;
        setAssignments(list);
        setMaxAgents(max);
        devLog('[AIAgents] Asignaciones:', list.length, '/ max:', max);
      } else {
        devError('[AIAgents] Error al cargar asignaciones:', assignmentsResult.reason);
      }

      // Observabilidad
      if (obsResult.status === 'fulfilled') {
        const payload = obsResult.value.data as unknown;
        const list: AgentObservabilityStats[] = Array.isArray(payload)
          ? payload
          : ((payload as Record<string, unknown>).data as AgentObservabilityStats[] ?? []);
        setObservabilityStats(list);
        devLog('[AIAgents] Stats obs:', list.length);
      } else {
        devError('[AIAgents] Error al cargar observabilidad:', obsResult.reason);
      }
    } catch (err: unknown) {
      const message = (err as Error).message ?? 'Error al cargar los agentes';
      devError('[AIAgents] Error general:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---------------------------------------------------------------------------
  // Acciones
  // ---------------------------------------------------------------------------

  const handleAssign = async (agentConfigId: number) => {
    try {
      setAssigningId(agentConfigId);
      setError(null);
      await api.post('/ai/agents/assignments', { agentConfigId });
      setSuccessMsg('Agente asignado correctamente');
      devLog('[AIAgents] Agente asignado:', agentConfigId);
      await loadData();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Error al asignar el agente';
      devError('[AIAgents] Error al asignar:', err);
      setError(message);
    } finally {
      setAssigningId(null);
    }
  };

  const handleUnassign = async (assignmentId: number) => {
    try {
      setUnassigningId(assignmentId);
      setError(null);
      await api.delete(`/ai/agents/assignments/${assignmentId}`);
      setSuccessMsg('Agente desasignado correctamente');
      devLog('[AIAgents] Agente desasignado:', assignmentId);
      await loadData();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Error al desasignar el agente';
      devError('[AIAgents] Error al desasignar:', err);
      setError(message);
    } finally {
      setUnassigningId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Helpers de UI
  // ---------------------------------------------------------------------------

  const getObsStats = (agentConfigId: number): AgentObservabilityStats | undefined =>
    observabilityStats.find((s) => s.agentConfigId === agentConfigId);

  const isAssigned = (agentConfigId: number): boolean =>
    assignments.some((a) => a.agentConfigId === agentConfigId);

  const getAssignmentId = (agentConfigId: number): number | undefined =>
    assignments.find((a) => a.agentConfigId === agentConfigId)?.id;

  const formatLatency = (ms: number) => `${ms.toFixed(0)}ms`;
  const formatErrorRate = (rate: number) => `${(rate * 100).toFixed(1)}%`;
  const formatCalls = (n: number) => new Intl.NumberFormat('es-ES').format(n);

  // Filtrado por departamento y busqueda
  const filteredAgents = useMemo(() => {
    return agents.filter(agent => {
      const matchesDept = activeDepartment === 'all' || agent.department === activeDepartment;
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q
        || agent.name.toLowerCase().includes(q)
        || (agent.description?.toLowerCase().includes(q))
        || (agent.capabilities?.some(c => c.toLowerCase().includes(q)));
      return matchesDept && matchesSearch;
    });
  }, [agents, activeDepartment, searchQuery]);

  // Conteo por departamento
  const departmentCounts = useMemo(() => {
    const counts: Record<string, number> = { all: agents.length };
    for (const agent of agents) {
      if (agent.department) {
        counts[agent.department] = (counts[agent.department] ?? 0) + 1;
      }
    }
    return counts;
  }, [agents]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          gap: 2,
          mb: 3,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Bot size={32} color="var(--joy-palette-primary-500)" />
          <Box>
            <Typography level="h2">Agentes de IA</Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              Catalogo de agentes inteligentes organizados por departamento
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Badge
            badgeContent={`${assignments.length}/${maxAgents}`}
            color={assignments.length >= maxAgents ? 'danger' : 'success'}
          >
            <Chip variant="soft" color="neutral" startDecorator={<UserCheck size={14} />}>
              Contratados
            </Chip>
          </Badge>
          <IconButton variant="outlined" onClick={loadData} disabled={loading} title="Recargar">
            <RefreshCw size={18} />
          </IconButton>
        </Box>
      </Box>

      {/* Alertas */}
      {error && (
        <Alert
          color="danger"
          sx={{ mb: 2 }}
          endDecorator={
            <IconButton size="sm" variant="plain" color="danger" onClick={() => setError(null)}>
              <X size={16} />
            </IconButton>
          }
        >
          {error}
        </Alert>
      )}
      {successMsg && (
        <Alert
          color="success"
          sx={{ mb: 2 }}
          endDecorator={
            <IconButton size="sm" variant="plain" color="success" onClick={() => setSuccessMsg(null)}>
              <X size={16} />
            </IconButton>
          }
        >
          {successMsg}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size="lg" />
        </Box>
      ) : (
        <Grid container spacing={3}>
          {/* Columna principal */}
          <Grid xs={12} md={selectedAgent ? 8 : 12}>

            {/* ----------------------------------------------------------------
                Seccion 1: Agentes contratados
            ---------------------------------------------------------------- */}
            {assignments.length > 0 && (
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                  <UserCheck size={20} color="var(--joy-palette-success-500)" />
                  <Typography level="title-lg">Mis Agentes Contratados</Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  {assignments.map((assignment) => {
                    const agent = agents.find((a) => a.id === assignment.agentConfigId)
                      ?? (assignment.agentConfig ? normalizeAgent(assignment.agentConfig as unknown as Record<string, unknown>) : null);
                    if (!agent) return null;
                    return (
                      <Sheet
                        key={assignment.id}
                        variant="outlined"
                        sx={{
                          p: 1.5,
                          borderRadius: 'md',
                          borderColor: 'success.300',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          minWidth: 200,
                        }}
                      >
                        <Box sx={{
                          width: 36, height: 36, borderRadius: '50%',
                          bgcolor: 'success.100', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <AgentIcon name={agent.icon} size={18} />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography level="body-sm" noWrap fontWeight="lg">{agent.name}</Typography>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {agent.department ? DEPARTMENTS[agent.department]?.label : AGENT_TYPE_LABELS[agent.agentType] ?? agent.agentType}
                          </Typography>
                        </Box>
                        <IconButton
                          size="sm"
                          variant="plain"
                          color="danger"
                          loading={unassigningId === assignment.id}
                          onClick={() => handleUnassign(assignment.id)}
                          title="Desasignar"
                        >
                          <UserMinus size={14} />
                        </IconButton>
                      </Sheet>
                    );
                  })}
                </Box>
                <Divider sx={{ mt: 3 }} />
              </Box>
            )}

            {/* ----------------------------------------------------------------
                Busqueda
            ---------------------------------------------------------------- */}
            <Box sx={{ mb: 2 }}>
              <Input
                placeholder="Buscar agente por nombre, descripcion o capacidad..."
                startDecorator={<Search size={16} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                sx={{ maxWidth: 500 }}
              />
            </Box>

            {/* ----------------------------------------------------------------
                Tabs de departamento
            ---------------------------------------------------------------- */}
            <Tabs
              value={activeDepartment}
              onChange={(_e, val) => setActiveDepartment(val as AgentDepartment | 'all')}
              sx={{ mb: 3, overflowX: 'auto' }}
            >
              <TabList
                variant="soft"
                sx={{
                  gap: 0.5,
                  flexWrap: 'nowrap',
                  overflow: 'auto',
                  scrollbarWidth: 'none',
                  '&::-webkit-scrollbar': { display: 'none' },
                  '& .MuiTab-root': { whiteSpace: 'nowrap', minHeight: 36, flexShrink: 0 },
                }}
              >
                <Tab value="all">
                  Todos ({departmentCounts.all ?? 0})
                </Tab>
                {DEPARTMENT_ORDER.map((dept) => {
                  const info = DEPARTMENTS[dept];
                  const count = departmentCounts[dept] ?? 0;
                  if (count === 0) return null;
                  const DeptIcon = info.icon;
                  return (
                    <Tab key={dept} value={dept} color={info.color}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <DeptIcon size={14} />
                        {info.label} ({count})
                      </Box>
                    </Tab>
                  );
                })}
              </TabList>
            </Tabs>

            {/* ----------------------------------------------------------------
                Seccion 2: Catalogo de agentes
            ---------------------------------------------------------------- */}
            {filteredAgents.length === 0 ? (
              <Card variant="soft" color="neutral">
                <CardContent>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary', textAlign: 'center', py: 2 }}>
                    {searchQuery
                      ? `No se encontraron agentes para "${searchQuery}"`
                      : 'No hay agentes configurados en este departamento.'}
                  </Typography>
                </CardContent>
              </Card>
            ) : (
              <Grid container spacing={2.5}>
                {filteredAgents.map((agent) => {
                  const obs = getObsStats(agent.id);
                  const assigned = isAssigned(agent.id);
                  const tier = agent.tier ?? 'mini';
                  const tierInfo = TIER_CONFIG[tier];
                  const caps = (agent.capabilities ?? []).slice(0, 3);
                  const deptInfo = agent.department ? DEPARTMENTS[agent.department] : null;
                  const deptColor = deptInfo?.color ?? 'primary';
                  const assignmentId = getAssignmentId(agent.id);

                  return (
                    <Grid key={agent.id} xs={12} sm={6} md={4}>
                      <Card
                        variant="outlined"
                        sx={{
                          height: '100%',
                          textAlign: 'center',
                          transition: 'all 0.2s ease',
                          position: 'relative',
                          '&:hover': {
                            borderColor: `${deptColor}.300`,
                            boxShadow: 'md',
                          },
                        }}
                      >
                        <CardContent sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          pt: 4,
                          pb: 2,
                        }}>

                          {/* Menu 3 puntos — top right */}
                          <Dropdown>
                            <MenuButton
                              slots={{ root: IconButton }}
                              slotProps={{
                                root: {
                                  variant: 'plain',
                                  size: 'sm',
                                  color: 'neutral',
                                  sx: { position: 'absolute', top: 8, right: 8 },
                                },
                              }}
                            >
                              <MoreHorizontal size={18} />
                            </MenuButton>
                            <Menu placement="bottom-end" size="sm">
                              <MenuItem onClick={() => setSelectedAgent(agent)}>
                                <Eye size={14} style={{ marginRight: 8 }} />
                                Ver Detalle
                              </MenuItem>
                              {assigned ? (
                                <MenuItem
                                  color="danger"
                                  disabled={unassigningId === assignmentId}
                                  onClick={() => { if (assignmentId) handleUnassign(assignmentId); }}
                                >
                                  <UserMinus size={14} style={{ marginRight: 8 }} />
                                  Desasignar
                                </MenuItem>
                              ) : (
                                <MenuItem
                                  color="primary"
                                  disabled={assignments.length >= maxAgents || assigningId === agent.id}
                                  onClick={() => handleAssign(agent.id)}
                                >
                                  <UserPlus size={14} style={{ marginRight: 8 }} />
                                  Asignar Agente
                                </MenuItem>
                              )}
                            </Menu>
                          </Dropdown>

                          {/* Avatar circular grande */}
                          <Box sx={{
                            width: 80,
                            height: 80,
                            borderRadius: '50%',
                            bgcolor: `${deptColor}.100`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            mb: 1.5,
                            border: '3px solid',
                            borderColor: `${deptColor}.200`,
                          }}>
                            <AgentIcon name={agent.icon} size={36} />
                          </Box>

                          {/* Status badge */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                            <Box sx={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              bgcolor: agent.isActive ? 'success.500' : 'neutral.300',
                            }} />
                            <Typography
                              level="body-xs"
                              sx={{ color: agent.isActive ? 'success.600' : 'text.tertiary' }}
                            >
                              {agent.isActive ? 'Activo' : 'Inactivo'}
                            </Typography>
                            {assigned && (
                              <Chip size="sm" color="success" variant="soft" sx={{ ml: 0.5, fontSize: '0.65rem' }}>
                                Asignado
                              </Chip>
                            )}
                          </Box>

                          {/* Nombre */}
                          <Typography level="title-md" sx={{ fontWeight: 600, mb: 0.25 }}>
                            {agent.name}
                          </Typography>

                          {/* Tier */}
                          <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 1.5 }}>
                            {tierInfo?.label ?? tier}
                          </Typography>

                          {/* Capability chips centrados */}
                          {caps.length > 0 && (
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', flexWrap: 'wrap', mb: 1.5 }}>
                              {caps.map((cap) => {
                                const capInfo = CAPABILITIES[cap];
                                return (
                                  <Chip
                                    key={cap}
                                    size="sm"
                                    variant="soft"
                                    color={capInfo?.color ?? 'neutral'}
                                    sx={{ fontSize: '0.65rem' }}
                                  >
                                    {capInfo?.label ?? cap}
                                  </Chip>
                                );
                              })}
                              {(agent.capabilities?.length ?? 0) > 3 && (
                                <Chip size="sm" variant="plain" sx={{ fontSize: '0.65rem', color: 'text.tertiary' }}>
                                  +{(agent.capabilities?.length ?? 0) - 3}
                                </Chip>
                              )}
                            </Box>
                          )}

                          {/* Divider + Stats (2 columnas) */}
                          <Divider sx={{ width: '100%', my: 1 }} />
                          <Box sx={{ display: 'flex', justifyContent: 'space-around', width: '100%', pt: 1 }}>
                            <Box>
                              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                Llamadas
                              </Typography>
                              <Typography level="title-sm" sx={{ fontWeight: 700 }}>
                                {obs ? formatCalls(obs.totalCalls) : '—'}
                              </Typography>
                            </Box>
                            <Box>
                              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                Latencia
                              </Typography>
                              <Typography level="title-sm" sx={{ fontWeight: 700 }}>
                                {obs ? formatLatency(obs.avgLatency) : '—'}
                              </Typography>
                            </Box>
                          </Box>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            )}
          </Grid>

          {/* ----------------------------------------------------------------
              Seccion 3: Panel de detalle del agente seleccionado
          ---------------------------------------------------------------- */}
          {selectedAgent && (
            <Grid xs={12} md={4}>
              <Card variant="outlined" sx={{ position: { md: 'sticky' }, top: { md: 16 } }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Typography level="title-lg">Detalle del Agente</Typography>
                    <IconButton size="sm" variant="plain" onClick={() => setSelectedAgent(null)}>
                      <X size={16} />
                    </IconButton>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {/* Icono + Nombre */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{
                        width: 48, height: 48, borderRadius: 'md',
                        bgcolor: selectedAgent.department
                          ? `${DEPARTMENTS[selectedAgent.department]?.color ?? 'primary'}.100`
                          : 'primary.100',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <AgentIcon name={selectedAgent.icon} size={24} />
                      </Box>
                      <Box>
                        <Typography level="title-md">{selectedAgent.name}</Typography>
                        {selectedAgent.version && (
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>v{selectedAgent.version}</Typography>
                        )}
                      </Box>
                    </Box>

                    {/* Departamento */}
                    {selectedAgent.department && DEPARTMENTS[selectedAgent.department] && (
                      <Box>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                          Departamento
                        </Typography>
                        <Chip
                          size="sm"
                          color={DEPARTMENTS[selectedAgent.department].color}
                          variant="soft"
                          startDecorator={(() => {
                            const DIcon = DEPARTMENTS[selectedAgent.department!].icon;
                            return <DIcon size={12} />;
                          })()}
                        >
                          {DEPARTMENTS[selectedAgent.department].label}
                        </Chip>
                      </Box>
                    )}

                    {/* Tipo + Tier */}
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Box>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>Tipo</Typography>
                        <Chip size="sm" color={AGENT_TYPE_COLORS[selectedAgent.agentType] ?? 'neutral'} variant="soft">
                          {AGENT_TYPE_LABELS[selectedAgent.agentType] ?? selectedAgent.agentType}
                        </Chip>
                      </Box>
                      <Box>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>Tier</Typography>
                        <Chip size="sm" color={TIER_CONFIG[selectedAgent.tier ?? 'mini']?.color ?? 'neutral'} variant="soft">
                          {TIER_CONFIG[selectedAgent.tier ?? 'mini']?.label ?? selectedAgent.tier}
                        </Chip>
                      </Box>
                    </Box>

                    {/* Modelo + Temperatura */}
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <Box>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>Modelo</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Cpu size={14} color="var(--joy-palette-neutral-500)" />
                          <Typography level="body-sm">{selectedAgent.modelKey}</Typography>
                        </Box>
                      </Box>
                      <Box>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>Temperatura</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Thermometer size={14} color="var(--joy-palette-warning-500)" />
                          <Typography level="body-sm">{selectedAgent.temperature}</Typography>
                        </Box>
                      </Box>
                    </Box>

                    {/* Estado */}
                    <Box>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>Estado</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {selectedAgent.isActive
                          ? <ToggleRight size={18} color="var(--joy-palette-success-500)" />
                          : <ToggleLeft size={18} color="var(--joy-palette-neutral-400)" />
                        }
                        <Typography
                          level="body-sm"
                          sx={{ color: selectedAgent.isActive ? 'success.600' : 'text.tertiary' }}
                        >
                          {selectedAgent.isActive ? 'Habilitado' : 'Deshabilitado'}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Capabilities completas */}
                    {selectedAgent.capabilities && selectedAgent.capabilities.length > 0 && (
                      <>
                        <Divider />
                        <Box>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                            Capacidades ({selectedAgent.capabilities.length})
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {selectedAgent.capabilities.map((cap) => {
                              const capInfo = CAPABILITIES[cap];
                              return (
                                <Chip
                                  key={cap}
                                  size="sm"
                                  variant="soft"
                                  color={capInfo?.color ?? 'neutral'}
                                  sx={{ fontSize: '0.7rem' }}
                                >
                                  {capInfo?.label ?? cap}
                                </Chip>
                              );
                            })}
                          </Box>
                        </Box>
                      </>
                    )}

                    {/* Descripcion */}
                    {selectedAgent.description && (
                      <>
                        <Divider />
                        <Box>
                          <Typography level="body-xs" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                            Descripcion
                          </Typography>
                          <Typography level="body-sm">{selectedAgent.description}</Typography>
                        </Box>
                      </>
                    )}

                    {/* Boton de accion */}
                    <Divider />
                    {isAssigned(selectedAgent.id) ? (
                      <Button
                        size="sm"
                        fullWidth
                        variant="soft"
                        color="danger"
                        startDecorator={<UserMinus size={14} />}
                        loading={unassigningId === getAssignmentId(selectedAgent.id)}
                        onClick={() => {
                          const aId = getAssignmentId(selectedAgent.id);
                          if (aId) handleUnassign(aId);
                        }}
                      >
                        Desasignar Agente
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        fullWidth
                        variant="solid"
                        color="primary"
                        startDecorator={<UserPlus size={14} />}
                        loading={assigningId === selectedAgent.id}
                        disabled={assignments.length >= maxAgents}
                        onClick={() => handleAssign(selectedAgent.id)}
                      >
                        Asignar Agente
                      </Button>
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      )}
    </Box>
  );
}
