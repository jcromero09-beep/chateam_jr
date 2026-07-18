import React, { useState, useEffect } from 'react';
// [Fase2·G] Conservados de MUI Joy a propósito: no hay equivalente en el design
// system (indicadores de progreso). Todo lo demás migrado a Tailwind v4 + tokens.
import { CircularProgress, LinearProgress } from '@mui/joy';
import {
  ArrowClockwise,
  ArrowsClockwise,
  TrendUp,
  TrendDown,
  CheckCircle,
  XCircle,
  Gauge,
  ChartLineUp,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'react-toastify';
import api from '../../services/api';

interface IntegrationConnection {
  id: number;
  name: string;
  integration_type: string;
  is_active: boolean;
}

interface AnalyticsData {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  pendingSyncs: number;
  successRate: number;
  totalRecordsProcessed: number;
  totalRecordsFailed: number;
  averageSyncDuration: number;
  syncsByType: {
    inbound: number;
    outbound: number;
  };
  syncsByEntity: Array<{
    entity_type: string;
    count: number;
  }>;
  recentErrors: Array<{
    date: string;
    connection: string;
    entity: string;
    error: string;
  }>;
  syncTrend: Array<{
    date: string;
    success: number;
    failed: number;
  }>;
  topPerformingConnections: Array<{
    connection: string;
    successRate: number;
    totalSyncs: number;
  }>;
  entityMappingStats: {
    total: number;
    synced: number;
    pending: number;
    failed: number;
  };
  webhookStats: {
    total: number;
    processed: number;
    pending: number;
    failed: number;
  };
}

// Superficie de tarjeta del design system (mismas clases que StatTile).
function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]',
        className,
      )}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold tracking-tight text-foreground">
      {children}
    </h2>
  );
}

// Fila etiqueta + badge con barra de progreso (distribución de estado / tipo).
function DistributionRow({
  label,
  value,
  percent,
  variant,
  color,
}: {
  label: string;
  value: string;
  percent: number;
  variant: BadgeProps['variant'];
  color: 'success' | 'danger' | 'warning' | 'primary';
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Badge variant={variant}>{value}</Badge>
      </div>
      <LinearProgress determinate value={percent} color={color} />
    </div>
  );
}

const entityColumns = ['Tipo de Entidad', 'Total Sincronizaciones', 'Porcentaje', ''];
const topColumns = ['Conexión', 'Total Sincronizaciones', 'Tasa de Éxito', ''];
const errorColumns = ['Fecha', 'Conexión', 'Entidad', 'Error'];

const IntegrationsAnalytics: React.FC = () => {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('7days');
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConnections();
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [selectedConnection, timeRange]);

  const fetchConnections = async () => {
    try {
      const { data } = await api.get('/integrations/connections');
      setConnections(data);
    } catch (error: any) {
      toast.error('Error al cargar conexiones: ' + (error.response?.data?.message || error.message));
    }
  };

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const params = {
        time_range: timeRange,
        ...(selectedConnection !== 'all' && { connection_id: selectedConnection })
      };

      const { data } = await api.get('/integrations/analytics', { params });
      setAnalytics(data);
    } catch (error: any) {
      toast.error('Error al cargar analytics: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('es-ES').format(num);
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}min`;
  };

  const getEntityTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      contact: 'Contactos',
      ticket: 'Tickets',
      message: 'Mensajes',
      user: 'Usuarios',
      company: 'Empresas',
      queue: 'Colas',
      tag: 'Etiquetas',
      campaign: 'Campañas'
    };
    return labels[type] || type;
  };

  // Umbrales de tasa de éxito -> tokens semánticos de texto / paleta Joy del progreso.
  const rateTextClass = (rate: number) =>
    rate >= 90 ? 'text-success-text' : rate >= 70 ? 'text-warning-text' : 'text-destructive-text';
  const rateBadgeVariant = (rate: number): BadgeProps['variant'] =>
    rate >= 90 ? 'success' : rate >= 70 ? 'warning' : 'destructive';
  const rateProgressColor = (rate: number) =>
    rate >= 90 ? ('success' as const) : rate >= 70 ? ('warning' as const) : ('danger' as const);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <CircularProgress />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="p-5 sm:p-6 lg:p-8">
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text"
        >
          <XCircle className="size-5 shrink-0" aria-hidden />
          Error al cargar los datos de analytics.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ChartLineUp className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Analytics de Integraciones
              </h1>
              <p className="text-sm text-muted-foreground">
                Rendimiento y estado de las sincronizaciones
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchAnalytics()}>
            <ArrowClockwise className="size-4" aria-hidden />
            Actualizar
          </Button>
        </div>

        {/* Filters */}
        <Panel>
          <div className="flex flex-wrap gap-4">
            <div className="min-w-[250px] flex-1 space-y-1.5 sm:flex-none">
              <Label htmlFor="analytics-connection">Conexión</Label>
              <Select
                value={selectedConnection}
                onValueChange={(value) => setSelectedConnection(value)}
              >
                <SelectTrigger id="analytics-connection" className="w-full sm:w-[250px]">
                  <SelectValue placeholder="Todas las Conexiones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las Conexiones</SelectItem>
                  {connections.map((conn) => (
                    <SelectItem key={conn.id} value={conn.id.toString()}>
                      {conn.name} ({conn.integration_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-[200px] flex-1 space-y-1.5 sm:flex-none">
              <Label htmlFor="analytics-range">Período de Tiempo</Label>
              <Select value={timeRange} onValueChange={(value) => setTimeRange(value)}>
                <SelectTrigger id="analytics-range" className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24hours">Últimas 24 horas</SelectItem>
                  <SelectItem value="7days">Últimos 7 días</SelectItem>
                  <SelectItem value="30days">Últimos 30 días</SelectItem>
                  <SelectItem value="90days">Últimos 90 días</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Panel>

        {/* Key Metrics Cards */}
        <div className="space-y-3">
          <SectionTitle>Métricas Principales</SectionTitle>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Panel>
              <p className="text-sm text-muted-foreground">Total Sincronizaciones</p>
              <p className="mt-1.5 flex items-center gap-2 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                <ArrowsClockwise className="size-6 shrink-0 text-muted-foreground" aria-hidden />
                {formatNumber(analytics.totalSyncs)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">En el período seleccionado</p>
            </Panel>

            <Panel>
              <p className="text-sm text-muted-foreground">Tasa de Éxito</p>
              <p
                className={cn(
                  'mt-1.5 flex items-center gap-2 text-3xl font-semibold tracking-tight tabular-nums',
                  rateTextClass(analytics.successRate),
                )}
              >
                {analytics.successRate >= 90 ? (
                  <TrendUp className="size-6 shrink-0" aria-hidden />
                ) : (
                  <TrendDown className="size-6 shrink-0" aria-hidden />
                )}
                {analytics.successRate.toFixed(1)}%
              </p>
              <div className="mt-3">
                <LinearProgress
                  determinate
                  value={analytics.successRate}
                  color={rateProgressColor(analytics.successRate)}
                />
              </div>
            </Panel>

            <Panel>
              <p className="text-sm text-muted-foreground">Registros Procesados</p>
              <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-primary">
                {formatNumber(analytics.totalRecordsProcessed)}
              </p>
              <p className="mt-1 text-xs text-destructive-text">
                {formatNumber(analytics.totalRecordsFailed)} fallidos
              </p>
            </Panel>

            <Panel>
              <p className="text-sm text-muted-foreground">Duración Promedio</p>
              <p className="mt-1.5 flex items-center gap-2 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                <Gauge className="size-6 shrink-0 text-muted-foreground" aria-hidden />
                {formatDuration(analytics.averageSyncDuration)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Por sincronización</p>
            </Panel>
          </div>
        </div>

        {/* Status Distribution */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel>
            <SectionTitle>Distribución de Estado</SectionTitle>
            <div className="mt-4 space-y-4">
              <DistributionRow
                label="Exitosos"
                value={formatNumber(analytics.successfulSyncs)}
                percent={(analytics.successfulSyncs / analytics.totalSyncs) * 100}
                variant="success"
                color="success"
              />
              <DistributionRow
                label="Fallidos"
                value={formatNumber(analytics.failedSyncs)}
                percent={(analytics.failedSyncs / analytics.totalSyncs) * 100}
                variant="destructive"
                color="danger"
              />
              <DistributionRow
                label="Pendientes"
                value={formatNumber(analytics.pendingSyncs)}
                percent={(analytics.pendingSyncs / analytics.totalSyncs) * 100}
                variant="warning"
                color="warning"
              />
            </div>
          </Panel>

          <Panel>
            <SectionTitle>Tipo de Sincronización</SectionTitle>
            <div className="mt-4 space-y-4">
              <DistributionRow
                label="Inbound (Entrante)"
                value={formatNumber(analytics.syncsByType.inbound)}
                percent={(analytics.syncsByType.inbound / analytics.totalSyncs) * 100}
                variant="primary"
                color="primary"
              />
              <DistributionRow
                label="Outbound (Saliente)"
                value={formatNumber(analytics.syncsByType.outbound)}
                percent={(analytics.syncsByType.outbound / analytics.totalSyncs) * 100}
                variant="success"
                color="success"
              />
            </div>
          </Panel>
        </div>

        {/* Syncs by Entity Type */}
        <div className="space-y-3">
          <SectionTitle>Sincronizaciones por Tipo de Entidad</SectionTitle>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {entityColumns.map((c, i) => (
                      <th
                        key={i}
                        className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {analytics.syncsByEntity.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                        No hay sincronizaciones en el período
                      </td>
                    </tr>
                  ) : (
                    analytics.syncsByEntity.map((item) => (
                      <tr key={item.entity_type} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3">
                          <Badge variant="outline">{getEntityTypeLabel(item.entity_type)}</Badge>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {formatNumber(item.count)}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {((item.count / analytics.totalSyncs) * 100).toFixed(1)}%
                        </td>
                        <td className="px-4 py-3">
                          <LinearProgress
                            determinate
                            value={(item.count / analytics.totalSyncs) * 100}
                            sx={{ width: 200 }}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Top Performing Connections */}
        <div className="space-y-3">
          <SectionTitle>Conexiones con Mejor Rendimiento</SectionTitle>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {topColumns.map((c, i) => (
                      <th
                        key={i}
                        className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {analytics.topPerformingConnections.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                        No hay conexiones con actividad
                      </td>
                    </tr>
                  ) : (
                    analytics.topPerformingConnections.map((item, index) => (
                      <tr key={index} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3 font-medium text-foreground">{item.connection}</td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {formatNumber(item.totalSyncs)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={rateBadgeVariant(item.successRate)}>
                            {item.successRate >= 90 ? (
                              <CheckCircle className="size-3.5 shrink-0" aria-hidden />
                            ) : (
                              <XCircle className="size-3.5 shrink-0" aria-hidden />
                            )}
                            {item.successRate.toFixed(1)}%
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <LinearProgress
                            determinate
                            value={item.successRate}
                            color={rateProgressColor(item.successRate)}
                            sx={{ width: 200 }}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Additional Stats */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel>
            <SectionTitle>Estadísticas de Mapeo de Entidades</SectionTitle>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Total Mapeos</span>
                <span className="text-lg font-semibold tabular-nums text-foreground">
                  {formatNumber(analytics.entityMappingStats.total)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Sincronizados</span>
                <Badge variant="success">{formatNumber(analytics.entityMappingStats.synced)}</Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Pendientes</span>
                <Badge variant="warning">{formatNumber(analytics.entityMappingStats.pending)}</Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Fallidos</span>
                <Badge variant="destructive">
                  {formatNumber(analytics.entityMappingStats.failed)}
                </Badge>
              </div>
            </div>
          </Panel>

          <Panel>
            <SectionTitle>Estadísticas de Webhooks</SectionTitle>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Total Eventos</span>
                <span className="text-lg font-semibold tabular-nums text-foreground">
                  {formatNumber(analytics.webhookStats.total)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Procesados</span>
                <Badge variant="success">{formatNumber(analytics.webhookStats.processed)}</Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Pendientes</span>
                <Badge variant="warning">{formatNumber(analytics.webhookStats.pending)}</Badge>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">Fallidos</span>
                <Badge variant="destructive">{formatNumber(analytics.webhookStats.failed)}</Badge>
              </div>
            </div>
          </Panel>
        </div>

        {/* Recent Errors */}
        {analytics.recentErrors.length > 0 && (
          <div className="space-y-3">
            <SectionTitle>Errores Recientes</SectionTitle>
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      {errorColumns.map((c, i) => (
                        <th
                          key={i}
                          className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {analytics.recentErrors.slice(0, 10).map((error, index) => (
                      <tr key={index} className="transition-colors hover:bg-accent/40">
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                          {new Date(error.date).toLocaleString('es-ES')}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">{error.connection}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{getEntityTypeLabel(error.entity)}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="block max-w-[400px] truncate text-destructive-text"
                            title={error.error}
                          >
                            {error.error}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default IntegrationsAnalytics;
