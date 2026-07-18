import React, { useState, useEffect } from 'react';
// [Fase2·G] CircularProgress se conserva en MUI Joy a propósito (no hay equivalente
// en el design system Tailwind/Radix todavía). El resto de la pantalla ya está migrado.
import { CircularProgress } from '@mui/joy';
import {
  ArrowRight,
  ArrowsLeftRight,
  FloppyDisk,
  Info,
  PencilSimple,
  Plus,
  Trash,
  Warning,
} from '@phosphor-icons/react';
import { toast } from 'react-toastify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '../../services/api';

interface IntegrationConnection {
  id: number;
  integration_type: string;
  name: string;
}

interface FieldMapping {
  id: number;
  connection_id: number;
  entity_type: string;
  local_field: string;
  external_field: string;
  is_required: boolean;
  default_value: string | null;
  transformation_rule: string | null;
  created_at: string;
}

interface FieldMappingFormData {
  connection_id: number;
  entity_type: string;
  local_field: string;
  external_field: string;
  is_required: boolean;
  default_value: string;
  transformation_rule: string;
}

const ENTITY_TYPES = [
  { value: 'contact', label: 'Contacto' },
  { value: 'ticket', label: 'Ticket' },
  { value: 'message', label: 'Mensaje' },
  { value: 'user', label: 'Usuario' },
  { value: 'company', label: 'Empresa' },
  { value: 'queue', label: 'Cola/Departamento' },
  { value: 'tag', label: 'Etiqueta' },
  { value: 'campaign', label: 'Campaña' }
];

const LOCAL_FIELDS_BY_ENTITY: Record<string, string[]> = {
  contact: ['name', 'number', 'email', 'profilePicUrl', 'isGroup', 'extraInfo'],
  ticket: ['status', 'userId', 'contactId', 'queueId', 'whatsappId', 'isGroup'],
  message: ['body', 'fromMe', 'mediaType', 'mediaUrl', 'ack', 'read'],
  user: ['name', 'email', 'profile', 'tokenVersion'],
  company: ['name', 'email', 'phone', 'plan', 'dueDate'],
  queue: ['name', 'color', 'greetingMessage', 'startWork', 'endWork'],
  tag: ['name', 'color', 'kanban'],
  campaign: ['name', 'status', 'scheduledAt', 'whatsappId', 'contactListId']
};

const TRANSFORMATION_RULES = [
  { value: 'none', label: 'Sin transformación' },
  { value: 'uppercase', label: 'MAYÚSCULAS' },
  { value: 'lowercase', label: 'minúsculas' },
  { value: 'trim', label: 'Eliminar espacios' },
  { value: 'normalize_phone', label: 'Normalizar teléfono (+521234567890)' },
  { value: 'parse_json', label: 'Parsear JSON' },
  { value: 'date_iso', label: 'Fecha ISO (YYYY-MM-DD)' },
  { value: 'boolean', label: 'Convertir a boolean' }
];

const columns = [
  'Campo Local',
  '',
  'Campo Externo',
  'Requerido',
  'Transformación',
  'Valor por Defecto',
  'Acciones'
];

const FieldMappingConfig: React.FC = () => {
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<number | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string>('contact');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<FieldMapping | null>(null);
  const [formData, setFormData] = useState<FieldMappingFormData>({
    connection_id: 0,
    entity_type: 'contact',
    local_field: '',
    external_field: '',
    is_required: false,
    default_value: '',
    transformation_rule: 'none'
  });

  useEffect(() => {
    fetchConnections();
  }, []);

  useEffect(() => {
    if (selectedConnection) {
      fetchMappings();
    }
  }, [selectedConnection, selectedEntity]);

  const fetchConnections = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/integrations/connections');
      setConnections(data.filter((c: any) => c.is_active));

      if (data.length > 0 && !selectedConnection) {
        setSelectedConnection(data[0].id);
      }
    } catch (error: any) {
      toast.error('Error al cargar conexiones: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const fetchMappings = async () => {
    if (!selectedConnection) return;

    try {
      const { data } = await api.get(`/integrations/connections/${selectedConnection}/mappings`, {
        params: { entity_type: selectedEntity }
      });
      setMappings(data);
    } catch (error: any) {
      toast.error('Error al cargar mapeos: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleOpenModal = (mapping?: FieldMapping) => {
    if (mapping) {
      setEditingMapping(mapping);
      setFormData({
        connection_id: mapping.connection_id,
        entity_type: mapping.entity_type,
        local_field: mapping.local_field,
        external_field: mapping.external_field,
        is_required: mapping.is_required,
        default_value: mapping.default_value || '',
        transformation_rule: mapping.transformation_rule || 'none'
      });
    } else {
      setEditingMapping(null);
      setFormData({
        connection_id: selectedConnection || 0,
        entity_type: selectedEntity,
        local_field: '',
        external_field: '',
        is_required: false,
        default_value: '',
        transformation_rule: 'none'
      });
    }
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingMapping(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const payload = {
        ...formData,
        default_value: formData.default_value || null,
        transformation_rule: formData.transformation_rule === 'none' ? null : formData.transformation_rule
      };

      if (editingMapping) {
        await api.put(`/integrations/field-mappings/${editingMapping.id}`, payload);
        toast.success('Mapeo actualizado exitosamente');
      } else {
        await api.post('/integrations/field-mappings', payload);
        toast.success('Mapeo creado exitosamente');
      }

      handleCloseModal();
      fetchMappings();
    } catch (error: any) {
      toast.error('Error al guardar mapeo: ' + (error.response?.data?.message || error.message));
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Está seguro de eliminar este mapeo?')) {
      return;
    }

    try {
      await api.delete(`/integrations/field-mappings/${id}`);
      toast.success('Mapeo eliminado exitosamente');
      fetchMappings();
    } catch (error: any) {
      toast.error('Error al eliminar mapeo: ' + (error.response?.data?.message || error.message));
    }
  };

  const _getConnectionName = (connectionId: number) => {
    const connection = connections.find(c => c.id === connectionId);
    return connection ? connection.name : `ID: ${connectionId}`;
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
      <div className="p-5 sm:p-6">
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/12 px-4 py-3 text-sm text-foreground"
        >
          <Warning className="mt-0.5 size-5 shrink-0 text-warning-text" weight="fill" aria-hidden />
          No hay conexiones activas. Configure una conexión primero para poder mapear campos.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-5 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <ArrowsLeftRight className="size-6" weight="bold" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Configuración de Mapeo de Campos
          </h1>
        </div>
        <Button size="sm" onClick={() => handleOpenModal()}>
          <Plus className="size-4" weight="bold" aria-hidden />
          Nuevo Mapeo
        </Button>
      </div>

      {/* Selector de conexión */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
        <div className="max-w-md space-y-1.5">
          <Label htmlFor="mapping-connection">Conexión</Label>
          <Select
            value={selectedConnection ? String(selectedConnection) : undefined}
            onValueChange={(value) => setSelectedConnection(Number(value))}
          >
            <SelectTrigger id="mapping-connection">
              <SelectValue placeholder="Seleccione una conexión" />
            </SelectTrigger>
            <SelectContent>
              {connections.map((conn) => (
                <SelectItem key={conn.id} value={String(conn.id)}>
                  {conn.name} ({conn.integration_type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={selectedEntity} onValueChange={(value) => setSelectedEntity(value)}>
        <div className="overflow-x-auto">
          <TabsList>
            {ENTITY_TYPES.map((entity) => (
              <TabsTrigger key={entity.value} value={entity.value}>
                {entity.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {ENTITY_TYPES.map((entity) => (
          <TabsContent key={entity.value} value={entity.value} className="mt-4">
            {mappings.length === 0 ? (
              <div
                role="status"
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
              >
                <Info className="size-[18px] shrink-0" aria-hidden />
                No hay mapeos configurados para {entity.label} en esta conexión.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
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
                      {mappings.map((mapping) => (
                        <tr key={mapping.id} className="transition-colors hover:bg-accent/40">
                          <td className="px-4 py-3">
                            <Badge variant="primary">{mapping.local_field}</Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <ArrowRight
                              className="inline size-4 text-muted-foreground"
                              aria-hidden
                            />
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="success">{mapping.external_field}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={mapping.is_required ? 'destructive' : 'neutral'}>
                              {mapping.is_required ? 'Sí' : 'No'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            {mapping.transformation_rule ? (
                              <Badge variant="outline">{mapping.transformation_rule}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {mapping.default_value ? (
                              <span
                                className="block max-w-[150px] truncate text-muted-foreground"
                                title={mapping.default_value}
                              >
                                {mapping.default_value}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                aria-label="Editar mapeo"
                                title="Editar"
                                onClick={() => handleOpenModal(mapping)}
                                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                              >
                                <PencilSimple className="size-[18px]" aria-hidden />
                              </button>
                              <button
                                type="button"
                                aria-label="Eliminar mapeo"
                                title="Eliminar"
                                onClick={() => handleDelete(mapping.id)}
                                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-text"
                              >
                                <Trash className="size-[18px]" aria-hidden />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={modalOpen} onOpenChange={(open) => !open && handleCloseModal()}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingMapping ? 'Editar Mapeo de Campo' : 'Nuevo Mapeo de Campo'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="mapping-entity-type">Tipo de Entidad</Label>
              <Select
                value={formData.entity_type}
                onValueChange={(value) =>
                  setFormData({ ...formData, entity_type: value, local_field: '' })
                }
              >
                <SelectTrigger id="mapping-entity-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map((entity) => (
                    <SelectItem key={entity.value} value={entity.value}>
                      {entity.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="h-px w-full bg-border" role="separator" />

            <div className="space-y-1.5">
              <Label htmlFor="mapping-local-field">Campo Local (Sistema JR Chateam)</Label>
              <Select
                value={formData.local_field || undefined}
                onValueChange={(value) => setFormData({ ...formData, local_field: value })}
              >
                <SelectTrigger id="mapping-local-field">
                  <SelectValue placeholder="Seleccione un campo local" />
                </SelectTrigger>
                <SelectContent>
                  {LOCAL_FIELDS_BY_ENTITY[formData.entity_type]?.map((field) => (
                    <SelectItem key={field} value={field}>
                      {field}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mapping-external-field">Campo Externo (Sistema Integrado)</Label>
              <Input
                id="mapping-external-field"
                value={formData.external_field}
                onChange={(e) => setFormData({ ...formData, external_field: e.target.value })}
                placeholder="Ej: customer_name, phone_number"
              />
            </div>

            <div className="h-px w-full bg-border" role="separator" />

            <div className="space-y-1.5">
              <Label htmlFor="mapping-transformation">Regla de Transformación</Label>
              <Select
                value={formData.transformation_rule}
                onValueChange={(value) => setFormData({ ...formData, transformation_rule: value })}
              >
                <SelectTrigger id="mapping-transformation">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSFORMATION_RULES.map((rule) => (
                    <SelectItem key={rule.value} value={rule.value}>
                      {rule.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mapping-default-value">Valor por Defecto</Label>
              <Input
                id="mapping-default-value"
                value={formData.default_value}
                onChange={(e) => setFormData({ ...formData, default_value: e.target.value })}
                placeholder="Valor a usar si el campo está vacío"
              />
            </div>

            <div className="flex items-center gap-3">
              <Checkbox
                id="is_required"
                checked={formData.is_required}
                onCheckedChange={(checked) => setFormData({ ...formData, is_required: checked })}
              />
              <Label htmlFor="is_required" className="cursor-pointer">
                Campo requerido (bloquear sincronización si falta)
              </Label>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={handleCloseModal}>
                Cancelar
              </Button>
              <Button type="submit" size="sm">
                <FloppyDisk className="size-4" aria-hidden />
                {editingMapping ? 'Actualizar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FieldMappingConfig;
