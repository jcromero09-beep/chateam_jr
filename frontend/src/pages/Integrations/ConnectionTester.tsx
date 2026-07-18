import React, { useState, useEffect } from 'react';
// [Fase2·G] CircularProgress se conserva en MUI Joy a propósito (no hay equivalente
// en el design system Tailwind/Radix todavía). El resto de la pantalla ya está migrado.
import { CircularProgress } from '@mui/joy';
import {
  ArrowClockwise,
  CheckCircle,
  Info,
  Play,
  PlugsConnected,
  Warning,
  XCircle,
} from '@phosphor-icons/react';
import { toast } from 'react-toastify';
import { StatTile } from '@/components/ui/stat-tile';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import api from '../../services/api';

interface IntegrationConnection {
  id: number;
  name: string;
  integration_type: string;
  is_active: boolean;
  credentials: Record<string, any>;
  webhook_url: string | null;
}

interface TestResult {
  success: boolean;
  timestamp: string;
  tests: Array<{
    name: string;
    status: 'success' | 'error' | 'warning' | 'info';
    message: string;
    duration?: number;
    details?: any;
  }>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  error?: string;
}

const ConnectionTester: React.FC = () => {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/integrations/connections');
      setConnections(data);

      if (data.length > 0 && !selectedConnection) {
        setSelectedConnection(data[0].id);
      }
    } catch (error: any) {
      toast.error('Error al cargar conexiones: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!selectedConnection) {
      toast.error('Seleccione una conexión para probar');
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);

      const { data } = await api.post(`/integrations/connections/${selectedConnection}/test`);
      setTestResult(data);

      if (data.success) {
        toast.success('Prueba de conexión completada exitosamente');
      } else {
        toast.error('La prueba de conexión encontró errores');
      }
    } catch (error: any) {
      const errorResult: TestResult = {
        success: false,
        timestamp: new Date().toISOString(),
        tests: [
          {
            name: 'Conexión al Servidor',
            status: 'error',
            message: error.response?.data?.message || error.message
          }
        ],
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          warnings: 0
        },
        error: error.response?.data?.message || error.message
      };
      setTestResult(errorResult);
      toast.error('Error al probar conexión: ' + (error.response?.data?.message || error.message));
    } finally {
      setTesting(false);
    }
  };

  // [a11y] Los iconos de estado usan los tokens *-text (contraste 4.5:1), nunca
  // los tokens de superficie (--success/--warning/--destructive).
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="size-5 text-success-text" weight="fill" aria-hidden />;
      case 'error':
        return <XCircle className="size-5 text-destructive-text" weight="fill" aria-hidden />;
      case 'warning':
        return <Warning className="size-5 text-warning-text" weight="fill" aria-hidden />;
      case 'info':
      default:
        return <Info className="size-5 text-primary" weight="fill" aria-hidden />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'success':
        return 'Correcto';
      case 'error':
        return 'Error';
      case 'warning':
        return 'Advertencia';
      case 'info':
      default:
        return 'Información';
    }
  };

  const getStatusVariant = (status: string): BadgeProps['variant'] => {
    switch (status) {
      case 'success':
        return 'success';
      case 'error':
        return 'destructive';
      case 'warning':
        return 'warning';
      case 'info':
      default:
        return 'neutral';
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getSelectedConnectionData = () => {
    return connections.find(c => c.id === selectedConnection);
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <CircularProgress />
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className="p-5 sm:p-6 lg:p-8">
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/12 px-4 py-3 text-sm text-foreground"
        >
          <Warning className="mt-0.5 size-5 shrink-0 text-warning-text" weight="fill" aria-hidden />
          <span>
            No hay conexiones configuradas. Configure una conexión primero para poder probarla.
          </span>
        </div>
      </div>
    );
  }

  const connectionData = getSelectedConnectionData();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <PlugsConnected className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Probador de Conexiones
              </h1>
              <p className="text-sm text-muted-foreground">
                Valida credenciales, conectividad y endpoints de tus integraciones
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchConnections}>
            <ArrowClockwise className="size-4" aria-hidden />
            Actualizar Lista
          </Button>
        </div>

        {/* Seleccionar conexión */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Seleccionar Conexión</h2>

          <div className="max-w-md space-y-1.5">
            <Label htmlFor="tester-connection">Conexión a Probar</Label>
            <Select
              value={selectedConnection != null ? String(selectedConnection) : undefined}
              onValueChange={(value) => {
                setSelectedConnection(Number(value));
                setTestResult(null);
              }}
            >
              <SelectTrigger id="tester-connection" className="w-full">
                <SelectValue placeholder="Seleccione una conexión" />
              </SelectTrigger>
              <SelectContent>
                {connections.map((conn) => (
                  <SelectItem key={conn.id} value={String(conn.id)}>
                    {conn.name} ({conn.integration_type}) {!conn.is_active && '(Inactiva)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {connectionData && (
            <dl className="mt-4 space-y-2">
              <div className="flex items-center gap-3">
                <dt className="text-sm text-muted-foreground">Tipo:</dt>
                <dd>
                  <Badge variant="primary">{connectionData.integration_type}</Badge>
                </dd>
              </div>
              <div className="flex items-center gap-3">
                <dt className="text-sm text-muted-foreground">Estado:</dt>
                <dd>
                  <Badge variant={connectionData.is_active ? 'success' : 'neutral'} dot>
                    {connectionData.is_active ? 'Activa' : 'Inactiva'}
                  </Badge>
                </dd>
              </div>
              {connectionData.webhook_url && (
                <div className="flex items-center gap-3">
                  <dt className="shrink-0 text-sm text-muted-foreground">Webhook:</dt>
                  <dd
                    className="max-w-[400px] truncate text-sm text-foreground"
                    title={connectionData.webhook_url}
                  >
                    {connectionData.webhook_url}
                  </dd>
                </div>
              )}
            </dl>
          )}

          <div className="my-5 border-t border-border" />

          <Button
            size="lg"
            className="w-full"
            onClick={handleTestConnection}
            loading={testing}
            disabled={!selectedConnection || testing}
          >
            {!testing && <Play className="size-4" weight="fill" aria-hidden />}
            {testing ? 'Probando Conexión...' : 'Ejecutar Prueba de Conexión'}
          </Button>
        </div>

        {/* Resultados */}
        {testResult && (
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02] sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Resultados de la Prueba</h2>

            {/* Summary */}
            <div
              role="status"
              className={cn(
                'flex items-start gap-3 rounded-lg border px-4 py-3',
                testResult.success
                  ? 'border-success/30 bg-success/12'
                  : 'border-destructive/30 bg-destructive/12',
              )}
            >
              {testResult.success ? (
                <CheckCircle className="mt-0.5 size-5 shrink-0 text-success-text" weight="fill" aria-hidden />
              ) : (
                <XCircle className="mt-0.5 size-5 shrink-0 text-destructive-text" weight="fill" aria-hidden />
              )}
              <div className="space-y-1">
                <p
                  className={cn(
                    'text-sm font-semibold',
                    testResult.success ? 'text-success-text' : 'text-destructive-text',
                  )}
                >
                  {testResult.success
                    ? 'Prueba completada exitosamente'
                    : 'Prueba completada con errores'}
                </p>
                <p className="text-sm text-foreground">
                  Total: {testResult.summary.total} pruebas | Exitosas: {testResult.summary.passed} |
                  Fallidas: {testResult.summary.failed} | Advertencias: {testResult.summary.warnings}
                </p>
                <p className="text-xs text-muted-foreground">
                  Ejecutado: {new Date(testResult.timestamp).toLocaleString('es-ES')}
                </p>
              </div>
            </div>

            {/* Summary stats */}
            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile label="Total pruebas" value={String(testResult.summary.total)} />
              <StatTile label="Exitosas" value={String(testResult.summary.passed)} tone="success" />
              <StatTile label="Fallidas" value={String(testResult.summary.failed)} tone="destructive" />
              <StatTile label="Advertencias" value={String(testResult.summary.warnings)} tone="warning" />
            </div>

            {/* Test Details */}
            <h3 className="mb-2 mt-6 text-base font-semibold text-foreground">Detalle de Pruebas</h3>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {testResult.tests.map((test, index) => (
                <li key={index} className="flex items-start gap-3 p-4">
                  <span className="mt-0.5 shrink-0" title={getStatusLabel(test.status)}>
                    {getStatusIcon(test.status)}
                    <span className="sr-only">{getStatusLabel(test.status)}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">{test.name}</span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={getStatusVariant(test.status)}>
                          {getStatusLabel(test.status)}
                        </Badge>
                        {test.duration && (
                          <Badge variant="outline" className="tabular-nums">
                            {formatDuration(test.duration)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{test.message}</p>
                    {test.details && (
                      <pre className="mt-2 max-h-52 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-foreground">
                        {JSON.stringify(test.details, null, 2)}
                      </pre>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {testResult.error && (
              <div
                role="alert"
                className="mt-6 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3"
              >
                <XCircle className="mt-0.5 size-5 shrink-0 text-destructive-text" weight="fill" aria-hidden />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-destructive-text">Error General</p>
                  <p className="break-words text-sm text-foreground">{testResult.error}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Test Information */}
        <div className="rounded-xl border border-border bg-muted/40 p-5 shadow-sm shadow-black/[0.02] sm:p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <Info className="size-5 text-primary" weight="fill" aria-hidden />
            Información sobre las Pruebas
          </h2>
          <ul className="space-y-2">
            <li className="flex items-start gap-2.5">
              <CheckCircle className="mt-0.5 size-4 shrink-0 text-success-text" weight="fill" aria-hidden />
              <span className="text-sm text-muted-foreground">
                <strong className="font-semibold text-foreground">Validación de Credenciales:</strong>{' '}
                Verifica que las credenciales de API sean válidas y tengan los permisos necesarios.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle className="mt-0.5 size-4 shrink-0 text-success-text" weight="fill" aria-hidden />
              <span className="text-sm text-muted-foreground">
                <strong className="font-semibold text-foreground">Conectividad:</strong> Prueba la
                conexión con el servidor externo y verifica que sea accesible.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle className="mt-0.5 size-4 shrink-0 text-success-text" weight="fill" aria-hidden />
              <span className="text-sm text-muted-foreground">
                <strong className="font-semibold text-foreground">Endpoints API:</strong> Valida que
                los endpoints principales estén disponibles y respondiendo correctamente.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle className="mt-0.5 size-4 shrink-0 text-success-text" weight="fill" aria-hidden />
              <span className="text-sm text-muted-foreground">
                <strong className="font-semibold text-foreground">Mapeo de Campos:</strong> Verifica
                que existan mapeos de campos configurados para la sincronización.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle className="mt-0.5 size-4 shrink-0 text-success-text" weight="fill" aria-hidden />
              <span className="text-sm text-muted-foreground">
                <strong className="font-semibold text-foreground">Webhook (opcional):</strong> Si está
                configurado, prueba que el webhook sea accesible y responda correctamente.
              </span>
            </li>
          </ul>

          <div className="my-5 border-t border-border" />

          <p className="text-xs text-muted-foreground">
            <strong className="font-semibold text-foreground">Nota:</strong> Las pruebas no modifican
            ningún dato. Solo validan la configuración y conectividad.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConnectionTester;
