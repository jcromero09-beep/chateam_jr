/**
 * Página: AIObservability
 * Observabilidad — trazas y métricas de IA
 * Módulo: ai_observability
 */

import { useState, useEffect, useCallback } from 'react';
import { CircularProgress } from '@mui/joy';
import {
  Pulse,
  Gauge,
  Warning,
  Stack,
  ArrowClockwise,
  X,
  Clock,
  CheckCircle,
  XCircle,
} from '@phosphor-icons/react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import api from '../services/api';

// Logging solo en desarrollo
const isDev = import.meta.env.DEV;
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args); };
const devError = (...args: unknown[]) => { if (isDev) console.error(...args); };

// Tipos
type TimePeriod = '7d' | '30d' | '90d';
type TraceStatus = 'success' | 'error' | 'pending' | string;

interface ObservabilityTrace {
  id?: number | string;
  traceId: string;
  model: string;
  latency: number;
  status: TraceStatus;
  timestamp: string;
  tokens?: number;
  cost?: number;
}

interface ModelStat {
  model: string;
  avgLatency: number;
  totalCalls?: number;
  errorRate?: number;
}

interface ObservabilityStats {
  totalTraces: number;
  avgLatency: number;
  errorRate: number;
  modelsUsed: number;
}

interface TracesResponse {
  traces?: ObservabilityTrace[];
  data?: ObservabilityTrace[];
}

interface StatsResponse {
  models?: ModelStat[];
  data?: ModelStat[];
  stats?: ObservabilityStats;
}

const PERIOD_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: '90d', label: 'Últimos 90 días' },
];

const STATUS_VARIANT: Record<string, BadgeProps['variant']> = {
  success: 'success',
  error: 'destructive',
  pending: 'warning',
};

export default function AIObservability() {
  // ─── Estado ──────────────────────────────────────────────────────────────
  const [period, setPeriod] = useState<TimePeriod>('7d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Datos
  const [traces, setTraces] = useState<ObservabilityTrace[]>([]);
  const [modelStats, setModelStats] = useState<ModelStat[]>([]);
  const [stats, setStats] = useState<ObservabilityStats>({
    totalTraces: 0,
    avgLatency: 0,
    errorRate: 0,
    modelsUsed: 0,
  });

  // ─── Cargar datos ─────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [tracesResult, modelsResult] = await Promise.allSettled([
        api.get<TracesResponse>(`/ai/observability/traces`, { params: { limit: 20, period } }),
        api.get<StatsResponse>(`/ai/observability/stats/models`, { params: { period } }),
      ]);

      // Procesar trazas
      if (tracesResult.status === 'fulfilled') {
        const raw = tracesResult.value.data as unknown as TracesResponse & { data?: ObservabilityTrace[] };
        const items = raw.traces ?? raw.data ?? [];
        setTraces(items);
        devLog('[AIObservability] Trazas cargadas:', items.length);
      } else {
        devError('[AIObservability] Error trazas:', tracesResult.reason);
      }

      // Procesar modelos y stats
      if (modelsResult.status === 'fulfilled') {
        const raw = modelsResult.value.data as unknown as StatsResponse;
        const models = raw.models ?? raw.data ?? [];
        setModelStats(models);

        // Calcular stats desde la respuesta o desde los datos locales
        if (raw.stats) {
          setStats(raw.stats);
        } else if (tracesResult.status === 'fulfilled') {
          const raw2 = tracesResult.value.data as unknown as TracesResponse & { data?: ObservabilityTrace[] };
          const items = raw2.traces ?? raw2.data ?? [];
          const total = items.length;
          const avgLat = total > 0
            ? Math.round(items.reduce((acc, t) => acc + (t.latency ?? 0), 0) / total)
            : 0;
          const errCount = items.filter((t) => t.status === 'error').length;
          const errRate = total > 0 ? Math.round((errCount / total) * 100) : 0;
          setStats({
            totalTraces: total,
            avgLatency: avgLat,
            errorRate: errRate,
            modelsUsed: models.length,
          });
        }
        devLog('[AIObservability] Modelos cargados:', models.length);
      } else {
        devError('[AIObservability] Error modelos:', modelsResult.reason);
      }

      // Si ambos fallaron, mostrar error
      if (tracesResult.status === 'rejected' && modelsResult.status === 'rejected') {
        const e = tracesResult.reason as { response?: { data?: { error?: string } } };
        setError(e.response?.data?.error ?? 'Error al cargar datos de observabilidad.');
      }
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Formateo ────────────────────────────────────────────────────────────
  const formatValue = (val: number): string => `${val} ms`;

  const formatLatency = (ms: number): string => {
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
  };

  const formatDate = (iso: string): string => {
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  };

  const truncateTrace = (id: string): string => {
    if (id.length <= 12) return id;
    return `${id.substring(0, 8)}...${id.substring(id.length - 4)}`;
  };

  // Datos del gráfico: latencia promedio por modelo
  const chartData = modelStats.map((m) => ({
    model: m.model.length > 16 ? m.model.substring(0, 14) + '…' : m.model,
    latencia: m.avgLatency,
    fullModel: m.model,
  }));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Pulse className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Observabilidad IA
              </h1>
              <p className="text-sm text-muted-foreground">
                Monitorea trazas, latencia y métricas de los modelos de IA
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(val) => setPeriod(val as TimePeriod)}>
              <SelectTrigger className="w-[180px]" aria-label="Periodo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadData} loading={loading}>
              <ArrowClockwise className="size-4" aria-hidden />
              Actualizar
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text"
          >
            <span>{error}</span>
            <button
              type="button"
              aria-label="Cerrar alerta"
              onClick={() => setError(null)}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-destructive-text transition-colors hover:bg-destructive/15"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* ── Stats Cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="mb-1 flex items-center gap-2">
              <Pulse className="size-[18px] text-primary" aria-hidden />
              <span className="text-sm text-muted-foreground">Total Trazas</span>
            </div>
            {loading ? (
              <CircularProgress size="sm" />
            ) : (
              <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                {stats.totalTraces.toLocaleString('es-ES')}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="mb-1 flex items-center gap-2">
              <Gauge className="size-[18px] text-success-text" aria-hidden />
              <span className="text-sm text-muted-foreground">Latencia promedio</span>
            </div>
            {loading ? (
              <CircularProgress size="sm" />
            ) : (
              <p className="text-3xl font-semibold tracking-tight tabular-nums text-success-text">
                {formatLatency(stats.avgLatency)}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="mb-1 flex items-center gap-2">
              <Warning className="size-[18px] text-warning-text" aria-hidden />
              <span className="text-sm text-muted-foreground">Tasa de error</span>
            </div>
            {loading ? (
              <CircularProgress size="sm" />
            ) : (
              <p
                className={`text-3xl font-semibold tracking-tight tabular-nums ${
                  stats.errorRate > 10 ? 'text-destructive-text' : 'text-warning-text'
                }`}
              >
                {stats.errorRate}%
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="mb-1 flex items-center gap-2">
              <Stack className="size-[18px] text-muted-foreground" aria-hidden />
              <span className="text-sm text-muted-foreground">Modelos usados</span>
            </div>
            {loading ? (
              <CircularProgress size="sm" />
            ) : (
              <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                {stats.modelsUsed}
              </p>
            )}
          </div>
        </div>

        {/* ── Gráfico de latencia por modelo ──────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <h2 className="mb-4 text-base font-semibold text-foreground">
            Latencia promedio por modelo
          </h2>

          {loading ? (
            <div className="flex justify-center py-12">
              <CircularProgress size="lg" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Pulse className="size-9" aria-hidden />
              <p className="text-sm">
                Sin datos de modelos para el periodo seleccionado
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis
                  dataKey="model"
                  tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number | undefined) => formatValue(v ?? 0)}
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                />
                <Tooltip
                  formatter={(v: number | undefined) => [formatValue(v ?? 0), 'Latencia']}
                  labelFormatter={(label: unknown) => {
                    const match = chartData.find((d) => d.model === label);
                    return match?.fullModel ?? String(label);
                  }}
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--popover)',
                    color: 'var(--popover-foreground)',
                    fontSize: 13,
                  }}
                  cursor={{ fill: 'var(--muted)' }}
                />
                <Bar
                  dataKey="latencia"
                  fill="var(--primary)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={60}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Tabla de trazas recientes ────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <h2 className="mb-4 text-base font-semibold text-foreground">
            Trazas recientes
          </h2>

          {loading ? (
            <div className="flex justify-center py-12">
              <CircularProgress size="lg" />
            </div>
          ) : traces.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <Pulse className="size-10" aria-hidden />
              <p className="text-sm">
                No hay trazas registradas para este periodo
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Trace ID
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Modelo
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Latencia
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Estado
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Timestamp
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {traces.map((trace, idx) => {
                    const statusVariant = STATUS_VARIANT[trace.status] ?? 'neutral';
                    const StatusIcon =
                      trace.status === 'success'
                        ? CheckCircle
                        : trace.status === 'error'
                        ? XCircle
                        : Clock;

                    return (
                      <tr
                        key={trace.id ?? trace.traceId ?? idx}
                        className="transition-colors hover:bg-accent/40"
                      >
                        <td className="px-4 py-3">
                          <span
                            className="font-mono text-xs text-muted-foreground"
                            title={trace.traceId}
                          >
                            {truncateTrace(trace.traceId)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground">{trace.model}</td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`font-medium tabular-nums ${
                              trace.latency > 5000
                                ? 'text-destructive-text'
                                : trace.latency > 2000
                                ? 'text-warning-text'
                                : 'text-success-text'
                            }`}
                          >
                            {formatLatency(trace.latency)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={statusVariant} className="justify-center">
                            <StatusIcon className="size-3" aria-hidden />
                            {trace.status === 'success'
                              ? 'Éxito'
                              : trace.status === 'error'
                              ? 'Error'
                              : trace.status === 'pending'
                              ? 'Pendiente'
                              : trace.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="size-3" aria-hidden />
                            <span className="text-xs">{formatDate(trace.timestamp)}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
