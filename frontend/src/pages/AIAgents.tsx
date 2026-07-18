/**
 * Pagina: AIAgents
 * Agentes de IA — catalogo por departamentos, contratacion y observabilidad.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
// [Fase2·G] Se conserva CircularProgress de Joy (no hay equivalente en el DS).
import { CircularProgress } from '@mui/joy';
import {
  Robot,
  UserCheck,
  UserMinus,
  UserPlus,
  X,
  ArrowClockwise,
  Pulse,
  Warning,
  ToggleLeft,
  ToggleRight,
  Thermometer,
  Cpu,
  MagnifyingGlass,
  Headphones,
  TrendUp,
  Megaphone,
  BookOpen,
  Lightning,
  ChartBar,
  Image,
  Shield,
  Brain,
  Globe,
  Star,
  FileText,
  Microphone,
  VideoCamera,
  Eye,
  Layout,
  Lock,
  EnvelopeSimple,
  Calendar,
  PencilLine,
  Target,
  CurrencyDollar,
  GitBranch,
  Timer,
  Plug,
  Heartbeat,
  Calculator,
  Sparkle,
  ChartLineUp,
  ShieldCheck,
  ShieldWarning,
  FileMagnifyingGlass,
  Books,
  FlowArrow,
  DotsThree,
  ClipboardText,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
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

/** Tonos del design system (coinciden 1:1 con las variantes de <Badge />). */
type Tone = 'primary' | 'success' | 'warning' | 'destructive' | 'neutral';

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
// Tokens de presentacion (clases estaticas: Tailwind no admite clases dinamicas)
// ---------------------------------------------------------------------------

/** Superficie tintada + texto accesible (*-text) para iconos/avatares por tono. */
const TONE_TINT: Record<Tone, string> = {
  primary: 'bg-primary/12 text-primary border-primary/25',
  success: 'bg-success/14 text-success-text border-success/30',
  warning: 'bg-warning/16 text-warning-text border-warning/30',
  destructive: 'bg-destructive/12 text-destructive-text border-destructive/30',
  neutral: 'bg-muted text-muted-foreground border-border',
};

/** Borde en hover de las tarjetas del catalogo, por departamento. */
const TONE_HOVER_BORDER: Record<Tone, string> = {
  primary: 'hover:border-primary/40',
  success: 'hover:border-success/40',
  warning: 'hover:border-warning/40',
  destructive: 'hover:border-destructive/40',
  neutral: 'hover:border-muted-foreground/40',
};

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

const AGENT_TYPE_COLORS: Record<string, Tone> = {
  router: 'primary',
  rag: 'success',
  support: 'warning',
  sales: 'neutral',
  escalation: 'destructive',
  supervisor: 'primary',
  content: 'success',
  analytics: 'warning',
  multimedia: 'neutral',
  security: 'destructive',
  automation: 'primary',
  research: 'success',
};

interface DepartmentInfo {
  label: string;
  icon: Icon;
  color: Tone;
  description: string;
}

const DEPARTMENTS: Record<AgentDepartment, DepartmentInfo> = {
  customer_service: { label: 'Atencion al Cliente', icon: Headphones, color: 'primary', description: 'Soporte, FAQ, escalacion y satisfaccion' },
  sales_crm:        { label: 'Ventas y CRM',       icon: TrendUp,    color: 'success', description: 'Pipeline, leads, cotizaciones y seguimiento' },
  marketing:        { label: 'Marketing',           icon: Megaphone,  color: 'warning', description: 'Redaccion, SEO, redes sociales y campanas' },
  knowledge_rag:    { label: 'Conocimiento & RAG',  icon: BookOpen,   color: 'neutral', description: 'Documentos, investigacion y base de conocimiento' },
  automation:       { label: 'Automatizacion',      icon: Lightning,  color: 'primary', description: 'Routing, flujos, tareas e integraciones' },
  analytics_bi:     { label: 'Analisis & BI',       icon: ChartBar,   color: 'success', description: 'Datos, reportes, KPIs y sentimiento' },
  multimedia:       { label: 'Multimedia',           icon: Image,      color: 'warning', description: 'Imagenes, audio, video y presentaciones' },
  security:         { label: 'Seguridad',            icon: Shield,     color: 'destructive',  description: 'Moderacion, spam, privacidad y amenazas' },
  product_management: { label: 'Producto',           icon: ClipboardText, color: 'primary', description: 'PRD, user stories, roadmap y feedback' },
};

const DEPARTMENT_ORDER: AgentDepartment[] = [
  'customer_service', 'sales_crm', 'marketing', 'knowledge_rag',
  'automation', 'analytics_bi', 'multimedia', 'security', 'product_management',
];

interface CapabilityInfo { label: string; color: Tone }

const CAPABILITIES: Record<string, CapabilityInfo> = {
  memory:              { label: 'Memoria',        color: 'primary' },
  rag:                 { label: 'RAG',             color: 'success' },
  web_search:          { label: 'Web',             color: 'warning' },
  knowledge_base:      { label: 'Base Conocim.',   color: 'success' },
  escalation:          { label: 'Escalacion',      color: 'destructive' },
  sentiment_analysis:  { label: 'Sentimiento',     color: 'destructive' },
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
  video_generation:    { label: 'Videos',          color: 'destructive' },
  vision:              { label: 'Vision IA',       color: 'primary' },
  ocr:                 { label: 'OCR',             color: 'neutral' },
  content_moderation:  { label: 'Moderacion',      color: 'destructive' },
  spam_detection:      { label: 'Anti-Spam',       color: 'destructive' },
  pii_detection:       { label: 'PII',             color: 'destructive' },
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
  persuasion:          { label: 'Persuasion',      color: 'destructive' },
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
  triggers:            { label: 'Triggers',        color: 'destructive' },
  cron:                { label: 'Cron',            color: 'neutral' },
  task_management:     { label: 'Tareas',          color: 'primary' },
  webhooks:            { label: 'Webhooks',        color: 'neutral' },
  data_mapping:        { label: 'Mapeo',           color: 'warning' },
  sql:                 { label: 'SQL',             color: 'success' },
  export:              { label: 'Exportar',        color: 'neutral' },
  observability:       { label: 'Observabilidad',  color: 'primary' },
  alerts:              { label: 'Alertas',         color: 'destructive' },
  metrics:             { label: 'Metricas',        color: 'success' },
  dashboards:          { label: 'Dashboards',      color: 'warning' },
  nlp:                 { label: 'NLP',             color: 'primary' },
  emotion_detection:   { label: 'Emociones',       color: 'destructive' },
  cost_optimization:   { label: 'Costos',          color: 'warning' },
  usage_analytics:     { label: 'Uso',             color: 'neutral' },
  recommendations:     { label: 'Recomendaciones', color: 'success' },
  dall_e:              { label: 'DALL-E',          color: 'warning' },
  style_transfer:      { label: 'Estilo',          color: 'neutral' },
  tts:                 { label: 'TTS',             color: 'primary' },
  voice_cloning:       { label: 'Voz',             color: 'warning' },
  heygen:              { label: 'HeyGen',          color: 'destructive' },
  avatars:             { label: 'Avatares',        color: 'neutral' },
  image_analysis:      { label: 'Analisis Img',    color: 'primary' },
  templates:           { label: 'Plantillas',      color: 'neutral' },
  formatting:          { label: 'Formato',         color: 'warning' },
  document_generation: { label: 'Documentos',      color: 'neutral' },
  toxicity_detection:  { label: 'Toxicidad',       color: 'destructive' },
  compliance:          { label: 'Compliance',      color: 'warning' },
  filtering:           { label: 'Filtrado',        color: 'neutral' },
  gdpr:                { label: 'GDPR',            color: 'destructive' },
  data_anonymization:  { label: 'Anonimizacion',   color: 'warning' },
  threat_detection:    { label: 'Amenazas',        color: 'destructive' },
  anomaly_detection:   { label: 'Anomalias',       color: 'warning' },
  priority_routing:    { label: 'Prioridad',       color: 'destructive' },
  analytics:           { label: 'Analitica',       color: 'success' },
  product_catalog:     { label: 'Catalogo',        color: 'neutral' },
  calculations:        { label: 'Calculos',        color: 'warning' },
  reminders:           { label: 'Recordatorios',   color: 'primary' },
  company_research:    { label: 'Investigacion',   color: 'success' },
  pricing:             { label: 'Precios',         color: 'warning' },
  content_calendar:    { label: 'Calendario',      color: 'neutral' },
  keyword_research:    { label: 'Keywords',        color: 'success' },
  video_ads:           { label: 'Video Ads',       color: 'warning' },
  pattern_interrupt:   { label: 'Pattern Int.',    color: 'destructive' },
  creative_hooks:      { label: 'Hooks',           color: 'success' },
  google_workspace:    { label: 'Google WS',       color: 'success' },
};

const TIER_CONFIG: Record<AgentTier, { label: string; color: Tone }> = {
  nano:    { label: 'Basico',   color: 'neutral' },
  mini:    { label: 'Estandar', color: 'primary' },
  full:    { label: 'Avanzado', color: 'warning' },
  premium: { label: 'Premium',  color: 'destructive' },
};

// Mapa de iconos string -> componente phosphor
const ICON_MAP: Record<string, Icon> = {
  'headphones': Headphones,
  'trending-up': TrendUp,
  'megaphone': Megaphone,
  'book-open': BookOpen,
  'zap': Lightning,
  'bar-chart-3': ChartBar,
  'image': Image,
  'shield': Shield,
  'bot': Robot,
  'brain': Brain,
  'search': MagnifyingGlass,
  'globe': Globe,
  'star': Star,
  'file-text': FileText,
  'mic': Microphone,
  'video': VideoCamera,
  'eye': Eye,
  'layout': Layout,
  'lock': Lock,
  'mail': EnvelopeSimple,
  'calendar': Calendar,
  'pen-line': PencilLine,
  'target': Target,
  'dollar-sign': CurrencyDollar,
  'git-branch': GitBranch,
  'timer': Timer,
  'plug': Plug,
  'heart-pulse': Heartbeat,
  'calculator': Calculator,
  'sparkles': Sparkle,
  'file-bar-chart': ChartLineUp,
  'shield-check': ShieldCheck,
  'shield-alert': ShieldWarning,
  'file-scan': FileMagnifyingGlass,
  'library': Books,
  'activity': Pulse,
  'alert-triangle': Warning,
  'workflow': FlowArrow,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function AgentIcon({ name, className = 'size-5' }: { name?: string; className?: string }) {
  const IconComp = ICON_MAP[name ?? 'bot'] ?? Robot;
  return <IconComp className={className} aria-hidden />;
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
  // Catalogo (se reutiliza dentro del TabsContent activo)
  // ---------------------------------------------------------------------------

  const catalog = filteredAgents.length === 0 ? (
    <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm shadow-black/[0.02]">
      <span className="text-sm text-muted-foreground">
        {searchQuery
          ? `No se encontraron agentes para "${searchQuery}"`
          : 'No hay agentes configurados en este departamento.'}
      </span>
    </div>
  ) : (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {filteredAgents.map((agent) => {
        const obs = getObsStats(agent.id);
        const assigned = isAssigned(agent.id);
        const tier = agent.tier ?? 'mini';
        const tierInfo = TIER_CONFIG[tier];
        const caps = (agent.capabilities ?? []).slice(0, 3);
        const deptInfo = agent.department ? DEPARTMENTS[agent.department] : null;
        const deptColor: Tone = deptInfo?.color ?? 'primary';
        const assignmentId = getAssignmentId(agent.id);

        return (
          <div
            key={agent.id}
            className={cn(
              'relative flex h-full flex-col items-center rounded-xl border border-border bg-card px-4 pb-4 pt-8 text-center shadow-sm shadow-black/[0.02] transition-[border-color,box-shadow] duration-200 hover:shadow-md',
              TONE_HOVER_BORDER[deptColor],
            )}
          >
            {/* Menu 3 puntos — top right */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Acciones para ${agent.name}`}
                  className="absolute right-2 top-2 size-8"
                >
                  <DotsThree className="size-[18px]" weight="bold" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setSelectedAgent(agent)}>
                  <Eye className="size-4" aria-hidden />
                  Ver Detalle
                </DropdownMenuItem>
                {assigned ? (
                  <DropdownMenuItem
                    disabled={unassigningId === assignmentId}
                    onSelect={() => { if (assignmentId) handleUnassign(assignmentId); }}
                    className="text-destructive-text focus:bg-destructive/10 focus:text-destructive-text"
                  >
                    <UserMinus className="size-4" aria-hidden />
                    Desasignar
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    disabled={assignments.length >= maxAgents || assigningId === agent.id}
                    onSelect={() => handleAssign(agent.id)}
                  >
                    <UserPlus className="size-4" aria-hidden />
                    Asignar Agente
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Avatar circular grande */}
            <span
              className={cn(
                'mb-3 flex size-20 shrink-0 items-center justify-center rounded-full border-[3px]',
                TONE_TINT[deptColor],
              )}
            >
              <AgentIcon name={agent.icon} className="size-9" />
            </span>

            {/* Status */}
            <span className="mb-2 flex flex-wrap items-center justify-center gap-1.5">
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'size-2 rounded-full',
                    agent.isActive ? 'bg-success' : 'bg-muted-foreground/40',
                  )}
                  aria-hidden
                />
                <span className={cn('text-xs', agent.isActive ? 'text-success-text' : 'text-muted-foreground')}>
                  {agent.isActive ? 'Activo' : 'Inactivo'}
                </span>
              </span>
              {assigned && <Badge variant="success">Asignado</Badge>}
            </span>

            {/* Nombre */}
            <span className="block text-base font-semibold text-foreground">{agent.name}</span>

            {/* Tier */}
            <span className="mb-3 block text-xs text-muted-foreground">
              {tierInfo?.label ?? tier}
            </span>

            {/* Capability badges centrados */}
            {caps.length > 0 && (
              <span className="mb-3 flex flex-wrap justify-center gap-1">
                {caps.map((cap) => {
                  const capInfo = CAPABILITIES[cap];
                  return (
                    <Badge key={cap} variant={capInfo?.color ?? 'neutral'}>
                      {capInfo?.label ?? cap}
                    </Badge>
                  );
                })}
                {(agent.capabilities?.length ?? 0) > 3 && (
                  <Badge variant="outline">+{(agent.capabilities?.length ?? 0) - 3}</Badge>
                )}
              </span>
            )}

            {/* Divisor + Stats (2 columnas) */}
            <span className="mt-auto block h-px w-full bg-border" aria-hidden />
            <span className="flex w-full justify-around pt-3">
              <span className="block">
                <span className="block text-xs text-muted-foreground">Llamadas</span>
                <span className="block text-sm font-bold tabular-nums text-foreground">
                  {obs ? formatCalls(obs.totalCalls) : '—'}
                </span>
              </span>
              <span className="block">
                <span className="block text-xs text-muted-foreground">Latencia</span>
                <span className="block text-sm font-bold tabular-nums text-foreground">
                  {obs ? formatLatency(obs.avgLatency) : '—'}
                </span>
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Robot className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Agentes de IA
              </h1>
              <p className="text-sm text-muted-foreground">
                Catalogo de agentes inteligentes organizados por departamento
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge
              variant={assignments.length >= maxAgents ? 'destructive' : 'success'}
              className="gap-1.5 px-2.5 py-1"
            >
              <UserCheck className="size-3.5" aria-hidden />
              Contratados
              <span className="font-semibold tabular-nums">
                {assignments.length}/{maxAgents}
              </span>
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Recargar agentes"
              className="text-muted-foreground"
              onClick={loadData}
              disabled={loading}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
          </div>
        </div>

        {/* Alertas */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text"
          >
            <span className="flex-1">{error}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Cerrar alerta de error"
              onClick={() => setError(null)}
              className="-my-1 size-7 shrink-0 text-destructive-text hover:bg-destructive/15 hover:text-destructive-text"
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        )}
        {successMsg && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success-text"
          >
            <span className="flex-1">{successMsg}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Cerrar mensaje de exito"
              onClick={() => setSuccessMsg(null)}
              className="-my-1 size-7 shrink-0 text-success-text hover:bg-success/15 hover:text-success-text"
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <CircularProgress size="lg" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Columna principal */}
            <div className={cn('space-y-6', selectedAgent ? 'lg:col-span-8' : 'lg:col-span-12')}>

              {/* ----------------------------------------------------------------
                  Seccion 1: Agentes contratados
              ---------------------------------------------------------------- */}
              {assignments.length > 0 && (
                <div className="space-y-4 border-b border-border pb-6">
                  <div className="flex items-center gap-2.5">
                    <UserCheck className="size-5 text-success-text" aria-hidden />
                    <h2 className="text-lg font-semibold text-foreground">Mis Agentes Contratados</h2>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {assignments.map((assignment) => {
                      const agent = agents.find((a) => a.id === assignment.agentConfigId)
                        ?? (assignment.agentConfig ? normalizeAgent(assignment.agentConfig as unknown as Record<string, unknown>) : null);
                      if (!agent) return null;
                      const busy = unassigningId === assignment.id;
                      return (
                        <div
                          key={assignment.id}
                          className="flex min-w-[200px] items-center gap-3 rounded-lg border border-success/40 bg-card p-3 shadow-sm shadow-black/[0.02]"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success/14 text-success-text">
                            <AgentIcon name={agent.icon} className="size-[18px]" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-foreground">
                              {agent.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {agent.department
                                ? DEPARTMENTS[agent.department]?.label
                                : AGENT_TYPE_LABELS[agent.agentType] ?? agent.agentType}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Desasignar ${agent.name}`}
                            loading={busy}
                            onClick={() => handleUnassign(assignment.id)}
                            className="size-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive-text"
                          >
                            {!busy && <UserMinus className="size-3.5" aria-hidden />}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ----------------------------------------------------------------
                  Busqueda
              ---------------------------------------------------------------- */}
              <div className="max-w-md">
                <Input
                  placeholder="Buscar agente por nombre, descripcion o capacidad..."
                  aria-label="Buscar agentes"
                  leftIcon={<MagnifyingGlass aria-hidden />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* ----------------------------------------------------------------
                  Tabs de departamento + catalogo
              ---------------------------------------------------------------- */}
              <Tabs
                value={activeDepartment}
                onValueChange={(val) => setActiveDepartment(val as AgentDepartment | 'all')}
              >
                <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <TabsList className="flex-nowrap">
                    <TabsTrigger value="all">Todos ({departmentCounts.all ?? 0})</TabsTrigger>
                    {DEPARTMENT_ORDER.map((dept) => {
                      const info = DEPARTMENTS[dept];
                      const count = departmentCounts[dept] ?? 0;
                      if (count === 0) return null;
                      const DeptIcon = info.icon;
                      return (
                        <TabsTrigger key={dept} value={dept}>
                          <DeptIcon className="size-3.5" aria-hidden />
                          {info.label} ({count})
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </div>

                {/* Un unico panel cuyo value sigue a la pestana activa. */}
                <TabsContent value={activeDepartment} className="mt-5">
                  {catalog}
                </TabsContent>
              </Tabs>
            </div>

            {/* ----------------------------------------------------------------
                Seccion 3: Panel de detalle del agente seleccionado
            ---------------------------------------------------------------- */}
            {selectedAgent && (
              <aside className="lg:col-span-4">
                <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] lg:sticky lg:top-4">
                  <div className="mb-4 flex items-start justify-between gap-2">
                    <h2 className="text-lg font-semibold text-foreground">Detalle del Agente</h2>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Cerrar detalle"
                      onClick={() => setSelectedAgent(null)}
                      className="size-8 shrink-0"
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  </div>

                  <div className="flex flex-col gap-4">
                    {/* Icono + Nombre */}
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'flex size-12 shrink-0 items-center justify-center rounded-lg border',
                          TONE_TINT[selectedAgent.department
                            ? DEPARTMENTS[selectedAgent.department]?.color ?? 'primary'
                            : 'primary'],
                        )}
                      >
                        <AgentIcon name={selectedAgent.icon} className="size-6" />
                      </span>
                      <div className="min-w-0">
                        <span className="block truncate text-base font-semibold text-foreground">
                          {selectedAgent.name}
                        </span>
                        {selectedAgent.version && (
                          <span className="block text-xs text-muted-foreground">v{selectedAgent.version}</span>
                        )}
                      </div>
                    </div>

                    {/* Departamento */}
                    {selectedAgent.department && DEPARTMENTS[selectedAgent.department] && (
                      <div>
                        <span className="mb-1.5 block text-xs text-muted-foreground">Departamento</span>
                        <Badge variant={DEPARTMENTS[selectedAgent.department].color}>
                          {(() => {
                            const DIcon = DEPARTMENTS[selectedAgent.department!].icon;
                            return <DIcon className="size-3" aria-hidden />;
                          })()}
                          {DEPARTMENTS[selectedAgent.department].label}
                        </Badge>
                      </div>
                    )}

                    {/* Tipo + Tier */}
                    <div className="flex gap-6">
                      <div>
                        <span className="mb-1.5 block text-xs text-muted-foreground">Tipo</span>
                        <Badge variant={AGENT_TYPE_COLORS[selectedAgent.agentType] ?? 'neutral'}>
                          {AGENT_TYPE_LABELS[selectedAgent.agentType] ?? selectedAgent.agentType}
                        </Badge>
                      </div>
                      <div>
                        <span className="mb-1.5 block text-xs text-muted-foreground">Tier</span>
                        <Badge variant={TIER_CONFIG[selectedAgent.tier ?? 'mini']?.color ?? 'neutral'}>
                          {TIER_CONFIG[selectedAgent.tier ?? 'mini']?.label ?? selectedAgent.tier}
                        </Badge>
                      </div>
                    </div>

                    {/* Modelo + Temperatura */}
                    <div className="flex gap-6">
                      <div>
                        <span className="mb-1.5 block text-xs text-muted-foreground">Modelo</span>
                        <span className="flex items-center gap-1.5">
                          <Cpu className="size-3.5 text-muted-foreground" aria-hidden />
                          <span className="text-sm text-foreground">{selectedAgent.modelKey}</span>
                        </span>
                      </div>
                      <div>
                        <span className="mb-1.5 block text-xs text-muted-foreground">Temperatura</span>
                        <span className="flex items-center gap-1.5">
                          <Thermometer className="size-3.5 text-warning-text" aria-hidden />
                          <span className="text-sm tabular-nums text-foreground">{selectedAgent.temperature}</span>
                        </span>
                      </div>
                    </div>

                    {/* Estado */}
                    <div>
                      <span className="mb-1.5 block text-xs text-muted-foreground">Estado</span>
                      <span className="flex items-center gap-1.5">
                        {selectedAgent.isActive ? (
                          <ToggleRight className="size-[18px] text-success-text" weight="fill" aria-hidden />
                        ) : (
                          <ToggleLeft className="size-[18px] text-muted-foreground" aria-hidden />
                        )}
                        <span className={cn('text-sm', selectedAgent.isActive ? 'text-success-text' : 'text-muted-foreground')}>
                          {selectedAgent.isActive ? 'Habilitado' : 'Deshabilitado'}
                        </span>
                      </span>
                    </div>

                    {/* Capabilities completas */}
                    {selectedAgent.capabilities && selectedAgent.capabilities.length > 0 && (
                      <>
                        <div className="h-px bg-border" aria-hidden />
                        <div>
                          <span className="mb-1.5 block text-xs text-muted-foreground">
                            Capacidades ({selectedAgent.capabilities.length})
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {selectedAgent.capabilities.map((cap) => {
                              const capInfo = CAPABILITIES[cap];
                              return (
                                <Badge key={cap} variant={capInfo?.color ?? 'neutral'}>
                                  {capInfo?.label ?? cap}
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Descripcion */}
                    {selectedAgent.description && (
                      <>
                        <div className="h-px bg-border" aria-hidden />
                        <div>
                          <span className="mb-1.5 block text-xs text-muted-foreground">Descripcion</span>
                          <span className="block text-sm text-foreground">{selectedAgent.description}</span>
                        </div>
                      </>
                    )}

                    {/* Boton de accion */}
                    <div className="h-px bg-border" aria-hidden />
                    {isAssigned(selectedAgent.id) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full border-destructive/30 bg-destructive/10 text-destructive-text hover:border-destructive/40 hover:bg-destructive/15 hover:text-destructive-text"
                        loading={unassigningId === getAssignmentId(selectedAgent.id)}
                        onClick={() => {
                          const aId = getAssignmentId(selectedAgent.id);
                          if (aId) handleUnassign(aId);
                        }}
                      >
                        <UserMinus className="size-3.5" aria-hidden />
                        Desasignar Agente
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full"
                        loading={assigningId === selectedAgent.id}
                        disabled={assignments.length >= maxAgents}
                        onClick={() => handleAssign(selectedAgent.id)}
                      >
                        <UserPlus className="size-3.5" aria-hidden />
                        Asignar Agente
                      </Button>
                    )}
                  </div>
                </div>
              </aside>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
