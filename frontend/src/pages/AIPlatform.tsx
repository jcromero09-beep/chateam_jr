/**
 * Página: AIPlatform
 * Dashboard principal de la Plataforma IA — acceso central a todos los módulos.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert,
  IconButton,
} from '@mui/joy';
import {
  Bot,
  CreditCard,
  DollarSign,
  Zap,
  BookOpen,
  Users,
  MessageSquare,
  PenLine,
  Headphones,
  Layers,
  Coins,
  Calendar,
  LayoutDashboard,
  X,
} from 'lucide-react';
import api from '../services/api';

// Helpers de logging para desarrollo
const isDev = import.meta.env.DEV;
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args); };
const devError = (...args: unknown[]) => { if (isDev) console.error(...args); };

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface AIAgent {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
}

interface CreditBalance {
  service: string;
  balance: number;
  currency: string;
}

interface CostReport {
  totalCost: number;
  currency: string;
  cacheHitRate: number;
  period: string;
}

interface PlatformStats {
  totalAgentes: number;
  creditosDisponibles: number;
  costoMensual: number;
  cacheHitRate: number;
}

interface QuickLink {
  label: string;
  description: string;
  icon: React.ReactNode;
  color: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
  permission: string;
}

// ---------------------------------------------------------------------------
// Quick links de módulos
// ---------------------------------------------------------------------------

const MODULE_LINKS: QuickLink[] = [
  {
    label: 'Base de Conocimiento',
    description: 'Gestiona documentos RAG para respuestas contextuales',
    icon: <BookOpen size={28} />,
    color: 'primary',
    permission: 'ai_knowledge_base',
  },
  {
    label: 'Agentes IA',
    description: 'Configura y contrata agentes especializados',
    icon: <Users size={28} />,
    color: 'success',
    permission: 'ai_agents',
  },
  {
    label: 'Constructor de Chatbots',
    description: 'Crea y entrena chatbots personalizados',
    icon: <MessageSquare size={28} />,
    color: 'warning',
    permission: 'ai_chatbot_builder',
  },
  {
    label: 'Escritor IA',
    description: 'Genera texto asistido con modelos avanzados',
    icon: <PenLine size={28} />,
    color: 'primary',
    permission: 'ai_writer',
  },
  {
    label: 'Generación de Audio',
    description: 'Convierte texto a voz y transcribe audio',
    icon: <Headphones size={28} />,
    color: 'danger',
    permission: 'ai_audio',
  },
  {
    label: 'Multimodal',
    description: 'Análisis de imágenes y contenido visual',
    icon: <Layers size={28} />,
    color: 'neutral',
    permission: 'ai_multimodal',
  },
  {
    label: 'Créditos',
    description: 'Administra y recarga tus créditos IA',
    icon: <Coins size={28} />,
    color: 'success',
    permission: 'ai_credits',
  },
  {
    label: 'Programador',
    description: 'Automatiza tareas con el scheduler de IA',
    icon: <Calendar size={28} />,
    color: 'warning',
    permission: 'ai_scheduler',
  },
];

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function AIPlatform() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PlatformStats>({
    totalAgentes: 0,
    creditosDisponibles: 0,
    costoMensual: 0,
    cacheHitRate: 0,
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [agentsResult, balancesResult, costsResult] = await Promise.allSettled([
        api.get<{ data: AIAgent[] }>('/ai/agents'),
        api.get<{ data: CreditBalance[] }>('/ai/credits/balances'),
        api.get<{ data: CostReport }>('/ai/costs/report', { params: { period: '30d' } }),
      ]);

      // Agentes activos
      let totalAgentes = 0;
      if (agentsResult.status === 'fulfilled') {
        const payload = agentsResult.value.data as unknown as { data?: AIAgent[] } | AIAgent[];
        const list: AIAgent[] = Array.isArray(payload)
          ? payload
          : ((payload as { data?: AIAgent[] }).data ?? []);
        totalAgentes = list.filter((a) => a.enabled).length;
        devLog('[AIPlatform] Agentes cargados:', list.length);
      } else {
        devError('[AIPlatform] Error al cargar agentes:', agentsResult.reason);
      }

      // Créditos disponibles
      let creditosDisponibles = 0;
      if (balancesResult.status === 'fulfilled') {
        const payload = balancesResult.value.data as unknown as { data?: CreditBalance[] } | CreditBalance[];
        const balances: CreditBalance[] = Array.isArray(payload)
          ? payload
          : ((payload as { data?: CreditBalance[] }).data ?? []);
        creditosDisponibles = balances.reduce((sum, b) => sum + (b.balance ?? 0), 0);
        devLog('[AIPlatform] Créditos totales:', creditosDisponibles);
      } else {
        devError('[AIPlatform] Error al cargar créditos:', balancesResult.reason);
      }

      // Costos y cache hit rate
      let costoMensual = 0;
      let cacheHitRate = 0;
      if (costsResult.status === 'fulfilled') {
        const payload = costsResult.value.data as unknown as { data?: CostReport } | CostReport;
        const report: CostReport = (
          !Array.isArray(payload) && (payload as { data?: CostReport }).data
            ? (payload as { data: CostReport }).data
            : payload
        ) as CostReport;
        costoMensual = report.totalCost ?? 0;
        cacheHitRate = report.cacheHitRate ?? 0;
        devLog('[AIPlatform] Reporte de costos:', report);
      } else {
        devError('[AIPlatform] Error al cargar costos:', costsResult.reason);
      }

      setStats({ totalAgentes, creditosDisponibles, costoMensual, cacheHitRate });
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Error al cargar los datos de la plataforma';
      devError('[AIPlatform] Error general:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(value);

  const formatNumber = (value: number) =>
    new Intl.NumberFormat('es-ES').format(value);

  const formatPercent = (value: number) =>
    `${(value * 100).toFixed(1)}%`;

  // ---------------------------------------------------------------------------
  // Stat cards config
  // ---------------------------------------------------------------------------

  const statCards = [
    {
      label: 'Agentes Activos',
      value: loading ? null : formatNumber(stats.totalAgentes),
      icon: <Bot size={20} color="var(--joy-palette-primary-500)" />,
    },
    {
      label: 'Créditos Disponibles',
      value: loading ? null : formatNumber(stats.creditosDisponibles),
      icon: <CreditCard size={20} color="var(--joy-palette-success-500)" />,
    },
    {
      label: 'Costo Mensual (30d)',
      value: loading ? null : formatCurrency(stats.costoMensual),
      icon: <DollarSign size={20} color="var(--joy-palette-warning-500)" />,
    },
    {
      label: 'Cache Hit Rate',
      value: loading ? null : formatPercent(stats.cacheHitRate),
      icon: <Zap size={20} color="var(--joy-palette-danger-500)" />,
    },
  ];

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <LayoutDashboard size={32} color="var(--joy-palette-primary-500)" />
        <Box>
          <Typography level="h2">Plataforma IA</Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Panel central de todos los módulos de inteligencia artificial
          </Typography>
        </Box>
      </Box>

      {/* Error */}
      {error && (
        <Alert
          color="danger"
          sx={{ mb: 3, mt: 2 }}
          endDecorator={
            <IconButton size="sm" variant="plain" color="danger" onClick={() => setError(null)}>
              <X size={16} />
            </IconButton>
          }
        >
          {error}
        </Alert>
      )}

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 4, mt: 1 }}>
        {statCards.map((card) => (
          <Grid key={card.label} xs={12} sm={6} md={3}>
            <Card variant="outlined">
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {card.icon}
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    {card.label}
                  </Typography>
                </Box>
                {loading ? (
                  <CircularProgress size="sm" />
                ) : (
                  <Typography level="h3">{card.value}</Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Módulos — Quick Links */}
      <Typography level="title-lg" sx={{ mb: 2 }}>
        Módulos disponibles
      </Typography>

      <Grid container spacing={2}>
        {MODULE_LINKS.map((mod) => (
          <Grid key={mod.permission} xs={12} sm={6} md={3}>
            <Card
              variant="soft"
              color={mod.color}
              sx={{
                cursor: 'pointer',
                transition: 'transform 0.15s, box-shadow 0.15s',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: 'md',
                },
              }}
            >
              <CardContent>
                <Box sx={{ mb: 1.5 }}>{mod.icon}</Box>
                <Typography level="title-md" sx={{ mb: 0.5 }}>
                  {mod.label}
                </Typography>
                <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                  {mod.description}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
