import React, { useState, useEffect } from 'react';
// [Fase2·G] Se conserva MUI Joy SOLO para el indicador de progreso (sin equivalente
// en el design system); el resto de la pantalla usa Tailwind v4 + shadcn/Radix.
import { CircularProgress } from '@mui/joy';
import {
  PlugsConnected,
  ArrowClockwise,
  Plus,
  PencilSimple,
  Trash,
  CheckCircle,
  XCircle,
  Play,
  SpinnerGap,
} from '@phosphor-icons/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  integration_type: 'billie' | 'aria_lite' | 'smarttrack' | 'sgr';
  name: string;
  is_active: boolean;
  credentials: Record<string, any>;
  webhook_url: string | null;
  last_sync_at: string | null;
  sync_frequency_minutes: number;
  created_at: string;
  updated_at: string;
}

interface ConnectionFormData {
  integration_type: string;
  name: string;
  is_active: boolean;
  credentials: string;
  webhook_url: string;
  sync_frequency_minutes: number;
}

const columns = [
  'Tipo',
  'Nombre',
  'Estado',
  'Última Sincronización',
  'Frecuencia',
  'Webhook',
  '',
];

// Botón de acción de fila (mismo look que RowAction del design system, con onClick).
function ActionBtn({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

const ConnectionsManager: React.FC = () => {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<IntegrationConnection | null>(null);
  const [testingConnection, setTestingConnection] = useState<number | null>(null);
  const [formData, setFormData] = useState<ConnectionFormData>({
    integration_type: 'billie',
    name: '',
    is_active: true,
    credentials: '{}',
    webhook_url: '',
    sync_frequency_minutes: 60
  });

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/integrations/connections');
      setConnections(data);
    } catch (error: any) {
      toast.error('Error al cargar conexiones: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (connection?: IntegrationConnection) => {
    if (connection) {
      setEditingConnection(connection);
      setFormData({
        integration_type: connection.integration_type,
        name: connection.name,
        is_active: connection.is_active,
        credentials: JSON.stringify(connection.credentials, null, 2),
        webhook_url: connection.webhook_url || '',
        sync_frequency_minutes: connection.sync_frequency_minutes
      });
    } else {
      setEditingConnection(null);
      setFormData({
        integration_type: 'billie',
        name: '',
        is_active: true,
        credentials: '{}',
        webhook_url: '',
        sync_frequency_minutes: 60
      });
    }
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingConnection(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Validate credentials JSON
      const credentialsObj = JSON.parse(formData.credentials);

      const payload = {
        ...formData,
        credentials: credentialsObj
      };

      if (editingConnection) {
        await api.put(`/integrations/connections/${editingConnection.id}`, payload);
        toast.success('Conexión actualizada exitosamente');
      } else {
        await api.post('/integrations/connections', payload);
        toast.success('Conexión creada exitosamente');
      }

      handleCloseModal();
      fetchConnections();
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        toast.error('Credenciales JSON inválidas');
      } else {
        toast.error('Error al guardar conexión: ' + (error.response?.data?.message || error.message));
      }
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Está seguro de eliminar esta conexión?')) {
      return;
    }

    try {
      await api.delete(`/integrations/connections/${id}`);
      toast.success('Conexión eliminada exitosamente');
      fetchConnections();
    } catch (error: any) {
      toast.error('Error al eliminar conexión: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleTestConnection = async (connectionId: number) => {
    try {
      setTestingConnection(connectionId);
      const { data } = await api.post(`/integrations/connections/${connectionId}/test`);

      if (data.success) {
        toast.success('Conexión probada exitosamente');
      } else {
        toast.error('Error en la prueba de conexión: ' + data.error);
      }
    } catch (error: any) {
      toast.error('Error al probar conexión: ' + (error.response?.data?.message || error.message));
    } finally {
      setTestingConnection(null);
    }
  };

  const getIntegrationTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      billie: 'Billie',
      aria_lite: 'Aria Lite',
      smarttrack: 'SmartTrack',
      sgr: 'SGR'
    };
    return labels[type] || type;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Nunca';
    return new Date(dateString).toLocaleString('es-ES');
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <CircularProgress />
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
              <PlugsConnected className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Gestión de Conexiones de Integración
              </h1>
              <p className="text-sm text-muted-foreground">
                Conexiones con sistemas externos y su sincronización
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchConnections}>
              <ArrowClockwise className="size-4" aria-hidden />
              Actualizar
            </Button>
            <Button size="sm" onClick={() => handleOpenModal()}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Nueva Conexión
            </Button>
          </div>
        </div>

        {/* Connections Table */}
        {connections.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm shadow-black/[0.02]">
            <p className="text-sm text-muted-foreground">
              No hay conexiones configuradas. Cree una nueva conexión para comenzar.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    {columns.map((c, i) => (
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
                  {connections.map((connection) => (
                    <tr key={connection.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <Badge variant="primary">
                          {getIntegrationTypeLabel(connection.integration_type)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {connection.name}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={connection.is_active ? 'success' : 'neutral'}>
                          {connection.is_active ? (
                            <CheckCircle className="size-3.5" weight="fill" aria-hidden />
                          ) : (
                            <XCircle className="size-3.5" weight="fill" aria-hidden />
                          )}
                          {connection.is_active ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatDate(connection.last_sync_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                        {connection.sync_frequency_minutes} min
                      </td>
                      <td className="px-4 py-3">
                        {connection.webhook_url ? (
                          <Badge variant="success">Configurado</Badge>
                        ) : (
                          <Badge variant="neutral">No configurado</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          <ActionBtn
                            label="Probar conexión"
                            onClick={() => handleTestConnection(connection.id)}
                            disabled={testingConnection === connection.id}
                            className="text-primary hover:bg-primary/10 hover:text-primary"
                          >
                            {testingConnection === connection.id ? (
                              <SpinnerGap className="size-[18px] animate-spin" aria-hidden />
                            ) : (
                              <Play className="size-[18px]" aria-hidden />
                            )}
                          </ActionBtn>
                          <ActionBtn
                            label="Editar"
                            onClick={() => handleOpenModal(connection)}
                          >
                            <PencilSimple className="size-[18px]" aria-hidden />
                          </ActionBtn>
                          <ActionBtn
                            label="Eliminar"
                            onClick={() => handleDelete(connection.id)}
                            className="hover:bg-destructive/10 hover:text-destructive-text"
                          >
                            <Trash className="size-[18px]" aria-hidden />
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal Create/Edit */}
      <Dialog open={modalOpen} onOpenChange={(open) => !open && handleCloseModal()}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingConnection ? 'Editar Conexión' : 'Nueva Conexión'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="integration-type">Tipo de Integración</Label>
              <Select
                value={formData.integration_type}
                onValueChange={(value) => setFormData({ ...formData, integration_type: value })}
                disabled={!!editingConnection}
              >
                <SelectTrigger id="integration-type" className="h-11">
                  <SelectValue placeholder="Seleccione un tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="billie">Billie</SelectItem>
                  <SelectItem value="aria_lite">Aria Lite</SelectItem>
                  <SelectItem value="smarttrack">SmartTrack</SelectItem>
                  <SelectItem value="sgr">SGR</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="connection-name">Nombre</Label>
              <Input
                id="connection-name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Conexión Billie Producción"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="connection-credentials">Credenciales (JSON)</Label>
              <textarea
                id="connection-credentials"
                required
                rows={4}
                value={formData.credentials}
                onChange={(e) => setFormData({ ...formData, credentials: e.target.value })}
                placeholder='{"api_key": "xxx", "api_secret": "yyy"}'
                className="w-full rounded-md border border-input bg-card px-3.5 py-2.5 font-mono text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="connection-webhook">Webhook URL</Label>
              <Input
                id="connection-webhook"
                value={formData.webhook_url}
                onChange={(e) => setFormData({ ...formData, webhook_url: e.target.value })}
                placeholder="https://api.example.com/webhooks/integration"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="connection-frequency">
                Frecuencia de Sincronización (minutos)
              </Label>
              <Input
                id="connection-frequency"
                type="number"
                required
                min={1}
                max={1440}
                value={formData.sync_frequency_minutes}
                onChange={(e) =>
                  setFormData({ ...formData, sync_frequency_minutes: Number(e.target.value) })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="connection-status">Estado</Label>
              <Select
                value={formData.is_active ? 'active' : 'inactive'}
                onValueChange={(value) => setFormData({ ...formData, is_active: value === 'active' })}
              >
                <SelectTrigger id="connection-status" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activa</SelectItem>
                  <SelectItem value="inactive">Inactiva</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={handleCloseModal}>
                Cancelar
              </Button>
              <Button type="submit" size="sm">
                {editingConnection ? 'Actualizar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConnectionsManager;
