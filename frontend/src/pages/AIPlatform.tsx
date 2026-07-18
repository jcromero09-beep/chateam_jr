/**
 * Página: AIPlatform
 * Dashboard principal de la Plataforma IA — acceso central a todos los módulos.
 */

import { useState, useEffect, useCallback } from 'react';
// [Migración] CircularProgress se conserva como MUI Joy (sin equivalente shadcn/Radix).
import { CircularProgress } from '@mui/joy';
import {
  Robot,
  CreditCard,
  CurrencyDollar,
  Lightning,
  BookOpen,
  Users,
  ChatCircle,
  PencilLine,
  Headphones,
  Stack,
  Coins,
  CalendarBlank,
  SquaresFour,
  X,
} from '@phosphor-icons/react';
import { RowAction } from '@/components/ui/row-action';
import { cn } from '@/lib/utils';
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

type ModuleTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

interface QuickLink {
  label: string;
  description: string;
  icon: React.ReactNode;
  color: ModuleTone;
  permission: string;
}

// Clases del tile de ícono por tono (superficie tintada + texto con contraste a11y).
const moduleTileClasses: Record<ModuleTone, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success-text',
  warning: 'bg-warning/10 text-warning-text',
  danger: 'bg-destructive/10 text-destructive-text',
  neutral: 'bg-muted text-muted-foreground',
};

// ---------------------------------------------------------------------------
// Quick links de módulos
// ---------------------------------------------------------------------------

const MODULE_LINKS: QuickLink[] = [
  {
    label: 'Base de Conocimiento',
    description: 'Gestiona documentos RAG para respuestas contextuales',
    icon: <BookOpen size={28} aria-hidden />,
    color: 'primary',
    permission: 'ai_knowledge_base',
  },
  {
    label: 'Agentes IA',
    description: 'Configura y contrata agentes especializados',
    icon: <Users size={28} aria-hidden />,
    color: 'success',
    permission: 'ai_agents',
  },
  {
    label: 'Constructor de Chatbots',
    description: 'Crea y entrena chatbots personalizados',
    icon: <ChatCircle size={28} aria-hidden />,
    color: 'warning',
    permission: 'ai_chatbot_builder',
  },
  {
    label: 'Escritor IA',
    description: 'Genera texto asistido con modelos avanzados',
    icon: <PencilLine size={28} aria-hidden />,
    color: 'primary',
    permission: 'ai_writer',
  },
  {
    label: 'Generación de Audio',
    description: 'Convierte texto a voz y transcribe audio',
    icon: <Headphones size={28} aria-hidden />,
    color: 'danger',
    permission: 'ai_audio',
  },
  {
    label: 'Multimodal',
    description: 'Análisis de imágenes y contenido visual',
    icon: <Stack size={28} aria-hidden />,
    color: 'neutral',
    permission: 'ai_multimodal',
  },
  {
    label: 'Créditos',
    description: 'Administra y recarga tus créditos IA',
    icon: <Coins size={28} aria-hidden />,
    color: 'success',
    permission: 'ai_credits',
  },
  {
    label: 'Programador',
    description: 'Automatiza tareas con el scheduler de IA',
    icon: <CalendarBlank size={28} aria-hidden />,
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
      icon: <Robot size={20} className="text-primary" aria-hidden />,
    },
    {
      label: 'Créditos Disponibles',
      value: loading ? null : formatNumber(stats.creditosDisponibles),
      icon: <CreditCard size={20} className="text-success-text" aria-hidden />,
    },
    {
      label: 'Costo Mensual (30d)',
      value: loading ? null : formatCurrency(stats.costoMensual),
      icon: <CurrencyDollar size={20} className="text-warning-text" aria-hidden />,
    },
    {
      label: 'Cache Hit Rate',
      value: loading ? null : formatPercent(stats.cacheHitRate),
      icon: <Lightning size={20} className="text-destructive-text" aria-hidden />,
    },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <SquaresFour className="size-6" weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Plataforma IA
            </h1>
            <p className="text-sm text-muted-foreground">
              Panel central de todos los módulos de inteligencia artificial
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text"
          >
            <span>{error}</span>
            <RowAction
              label="Cerrar aviso"
              className="-my-1 -mr-1 shrink-0 text-destructive-text hover:bg-destructive/15 hover:text-destructive-text"
            >
              <button
                type="button"
                aria-label="Cerrar aviso"
                onClick={() => setError(null)}
                className="flex size-full items-center justify-center"
              >
                <X className="size-[18px]" aria-hidden />
              </button>
            </RowAction>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]"
            >
              <div className="mb-2 flex items-center gap-2">
                {card.icon}
                <span className="text-sm text-muted-foreground">{card.label}</span>
              </div>
              {loading ? (
                <CircularProgress size="sm" />
              ) : (
                <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  {card.value}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Módulos — Quick Links */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Módulos disponibles</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODULE_LINKS.map((mod) => (
              <div
                key={mod.permission}
                className="group rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-md"
              >
                <span
                  className={cn(
                    'mb-3 flex size-12 items-center justify-center rounded-lg',
                    moduleTileClasses[mod.color],
                  )}
                >
                  {mod.icon}
                </span>
                <p className="mb-0.5 text-base font-semibold text-foreground">
                  {mod.label}
                </p>
                <p className="text-xs text-muted-foreground">{mod.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
