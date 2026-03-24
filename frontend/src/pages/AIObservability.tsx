/**
 * Página: AIObservability
 * Observabilidad — trazas y métricas de IA
 * Módulo: ai_observability
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert,
  Select,
  Option,
  Table,
  Sheet,
  Chip,
  IconButton,
} from '@mui/joy';
import {
  Activity,
  Gauge,
  AlertTriangle,
  Layers,
  RefreshCw,
  X,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
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

const STATUS_COLOR: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  success: 'success',
  error: 'danger',
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
        <Box>
          <Typography level="h2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Activity size={28} color="var(--joy-palette-primary-500)" />
            Observabilidad IA
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary', mt: 0.5 }}>
            Monitorea trazas, latencia y métricas de los modelos de IA
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Select
            value={period}
            onChange={(_, val) => val && setPeriod(val as TimePeriod)}
            size="sm"
            sx={{ minWidth: 160 }}
          >
            {PERIOD_OPTIONS.map((opt) => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Select>
          <Button
            variant="outlined"
            size="sm"
            startDecorator={<RefreshCw size={14} />}
            onClick={loadData}
            loading={loading}
          >
            Actualizar
          </Button>
        </Box>
      </Box>

      {/* Error */}
      {error && (
        <Alert
          color="danger"
          sx={{ mb: 3 }}
          endDecorator={
            <IconButton size="sm" variant="plain" color="danger" onClick={() => setError(null)}>
              <X size={16} />
            </IconButton>
          }
        >
          {error}
        </Alert>
      )}

      {/* ── Stats Cards ──────────────────────────────────────────────────── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Activity size={18} color="var(--joy-palette-primary-500)" />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Total Trazas
                </Typography>
              </Box>
              {loading ? (
                <CircularProgress size="sm" />
              ) : (
                <Typography level="h3">
                  {stats.totalTraces.toLocaleString('es-ES')}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Gauge size={18} color="var(--joy-palette-success-500)" />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Latencia promedio
                </Typography>
              </Box>
              {loading ? (
                <CircularProgress size="sm" />
              ) : (
                <Typography level="h3" sx={{ color: 'success.600' }}>
                  {formatLatency(stats.avgLatency)}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AlertTriangle size={18} color="var(--joy-palette-warning-500)" />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Tasa de error
                </Typography>
              </Box>
              {loading ? (
                <CircularProgress size="sm" />
              ) : (
                <Typography
                  level="h3"
                  sx={{ color: stats.errorRate > 10 ? 'danger.500' : 'warning.600' }}
                >
                  {stats.errorRate}%
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Layers size={18} color="var(--joy-palette-neutral-500)" />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Modelos usados
                </Typography>
              </Box>
              {loading ? (
                <CircularProgress size="sm" />
              ) : (
                <Typography level="h3">{stats.modelsUsed}</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Gráfico de latencia por modelo ──────────────────────────────── */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography level="title-md" sx={{ mb: 2 }}>
            Latencia promedio por modelo
          </Typography>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size="lg" />
            </Box>
          ) : chartData.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 5, color: 'text.tertiary' }}>
              <Activity size={36} />
              <Typography level="body-sm" sx={{ mt: 1 }}>
                Sin datos de modelos para el periodo seleccionado
              </Typography>
            </Box>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="model"
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number | undefined) => formatValue(v ?? 0)}
                  tick={{ fontSize: 11 }}
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
                    border: '1px solid var(--joy-palette-neutral-200)',
                    fontSize: 13,
                  }}
                />
                <Bar
                  dataKey="latencia"
                  fill="var(--joy-palette-primary-400)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={60}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Tabla de trazas recientes ────────────────────────────────────── */}
      <Card>
        <CardContent>
          <Typography level="title-md" sx={{ mb: 2 }}>
            Trazas recientes
          </Typography>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size="lg" />
            </Box>
          ) : traces.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6, color: 'text.tertiary' }}>
              <Activity size={40} />
              <Typography level="body-sm" sx={{ mt: 1.5 }}>
                No hay trazas registradas para este periodo
              </Typography>
            </Box>
          ) : (
            <Sheet sx={{ overflow: 'auto', borderRadius: 'sm' }}>
              <Table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 140 }}>Trace ID</th>
                    <th style={{ minWidth: 160 }}>Modelo</th>
                    <th style={{ width: 110, textAlign: 'right' }}>Latencia</th>
                    <th style={{ width: 120, textAlign: 'center' }}>Estado</th>
                    <th style={{ width: 160 }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {traces.map((trace, idx) => {
                    const statusColor =
                      STATUS_COLOR[trace.status] ?? 'neutral';
                    const StatusIcon =
                      trace.status === 'success'
                        ? CheckCircle2
                        : trace.status === 'error'
                        ? XCircle
                        : Clock;

                    return (
                      <tr key={trace.id ?? trace.traceId ?? idx}>
                        <td>
                          <Typography
                            level="body-xs"
                            sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                            title={trace.traceId}
                          >
                            {truncateTrace(trace.traceId)}
                          </Typography>
                        </td>
                        <td>
                          <Typography level="body-sm">{trace.model}</Typography>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Typography
                            level="body-sm"
                            sx={{
                              color:
                                trace.latency > 5000
                                  ? 'danger.500'
                                  : trace.latency > 2000
                                  ? 'warning.600'
                                  : 'success.600',
                              fontWeight: 'md',
                            }}
                          >
                            {formatLatency(trace.latency)}
                          </Typography>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Chip
                            size="sm"
                            color={statusColor}
                            variant="soft"
                            startDecorator={<StatusIcon size={12} />}
                          >
                            {trace.status === 'success'
                              ? 'Éxito'
                              : trace.status === 'error'
                              ? 'Error'
                              : trace.status === 'pending'
                              ? 'Pendiente'
                              : trace.status}
                          </Chip>
                        </td>
                        <td>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Clock size={12} color="var(--joy-palette-text-tertiary)" />
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              {formatDate(trace.timestamp)}
                            </Typography>
                          </Box>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Sheet>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
