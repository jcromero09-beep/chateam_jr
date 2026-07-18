/**
 * Página: AIABTesting
 * Tests A/B de IA — gestión y seguimiento de experimentos
 * Módulo: ai_ab_testing
 */

import { useState, useEffect, useCallback } from 'react';
import { CircularProgress } from '@mui/joy';
import {
  Flask,
  Plus,
  Play,
  Pause,
  ArrowClockwise,
  Trophy,
  X,
  CheckCircle,
  Circle,
  Clock,
  FileText,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RowAction } from '@/components/ui/row-action';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import api from '../services/api';

// Logging solo en desarrollo
const isDev = import.meta.env.DEV;
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args); };
const devError = (...args: unknown[]) => { if (isDev) console.error(...args); };

// Clases compartidas para campos de formulario (mismo look que el <Input> del DS)
const fieldClass =
  'w-full rounded-md border border-input bg-card text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-55';

// Tipos
type ABTestStatus = 'draft' | 'running' | 'paused' | 'completed';

interface ABTestVariant {
  id?: number | string;
  name?: string;
  prompt?: string;
}

interface ABTest {
  id: number | string;
  name: string;
  description?: string;
  status: ABTestStatus;
  variants?: ABTestVariant[];
  variantsCount?: number;
  startDate?: string;
  endDate?: string;
  winner?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

type TestType = 'prompt' | 'model' | 'temperature' | 'system_message' | 'rag_config' | 'classifier_prompt';

const TEST_TYPE_LABELS: Record<TestType, string> = {
  prompt: 'Prompt',
  model: 'Modelo',
  temperature: 'Temperatura',
  system_message: 'Mensaje sistema',
  rag_config: 'Config RAG',
  classifier_prompt: 'Prompt clasificador Kanban',
};

interface VariantForm {
  name: string;
  configJson: string;
}

interface CreateTestForm {
  name: string;
  description: string;
  testType: TestType;
  variants: VariantForm[];
}

const INITIAL_FORM: CreateTestForm = {
  name: '',
  description: '',
  testType: 'prompt',
  variants: [
    { name: 'Control', configJson: '{}' },
    { name: 'Variante B', configJson: '{}' },
  ],
};

const STATUS_CONFIG: Record<
  ABTestStatus,
  { label: string; variant: BadgeProps['variant']; icon: React.ReactNode }
> = {
  draft: { label: 'Borrador', variant: 'neutral', icon: <FileText className="size-3" aria-hidden /> },
  running: { label: 'Activo', variant: 'success', icon: <Circle className="size-3" weight="fill" aria-hidden /> },
  paused: { label: 'Pausado', variant: 'warning', icon: <Pause className="size-3" weight="fill" aria-hidden /> },
  completed: { label: 'Completado', variant: 'primary', icon: <CheckCircle className="size-3" weight="fill" aria-hidden /> },
};

export default function AIABTesting() {
  // ─── Estado ──────────────────────────────────────────────────────────────
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | number | null>(null);

  // Modal crear test
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CreateTestForm>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ─── Cargar tests ─────────────────────────────────────────────────────────
  const loadTests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/ai/ab-tests');
      const data = res.data as unknown as { data?: ABTest[] } | ABTest[];
      const items = Array.isArray(data) ? data : ((data as { data?: ABTest[] }).data ?? []);
      setTests(items);
      devLog('[AIABTesting] Tests cargados:', items.length);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      setError(e.response?.data?.error ?? e.response?.data?.message ?? 'Error al cargar los tests A/B.');
      devError('[AIABTesting] Error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTests();
  }, [loadTests]);

  // ─── Stats derivadas ─────────────────────────────────────────────────────
  const stats = {
    total: tests.length,
    active: tests.filter((t) => t.status === 'running').length,
    completed: tests.filter((t) => t.status === 'completed').length,
  };

  // ─── Acciones ────────────────────────────────────────────────────────────
  const handleStart = async (id: number | string) => {
    try {
      setActionLoading(id);
      setError(null);
      await api.post(`/ai/ab-tests/${id}/start`);
      setTests((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'running' as ABTestStatus } : t))
      );
      devLog('[AIABTesting] Test iniciado:', id);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'Error al iniciar el test.');
      devError('[AIABTesting] Error al iniciar:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async (id: number | string) => {
    try {
      setActionLoading(id);
      setError(null);
      await api.post(`/ai/ab-tests/${id}/pause`);
      setTests((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'paused' as ABTestStatus } : t))
      );
      devLog('[AIABTesting] Test pausado:', id);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'Error al pausar el test.');
      devError('[AIABTesting] Error al pausar:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Crear test ──────────────────────────────────────────────────────────
  const handleCreate = async () => {
    setFormError(null);
    if (!form.name.trim()) {
      setFormError('El nombre del test es requerido.');
      return;
    }
    try {
      setCreating(true);
      // Parsear configs de variantes
      const variants = form.variants.map((v, i) => {
        let config = {};
        try { config = JSON.parse(v.configJson || '{}'); } catch { /* usar vacío */ }
        return { name: v.name || `Variante ${i + 1}`, isControl: i === 0, config };
      });
      const res = await api.post('/ai/ab-tests', {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        testType: form.testType,
        agentType: form.testType === 'classifier_prompt' ? 'classifier_prompt' : undefined,
        variants,
      });
      const data = res.data as unknown as { data?: ABTest } & ABTest;
      const newTest = data.data ?? data;
      setTests((prev) => [newTest, ...prev]);
      setModalOpen(false);
      setForm(INITIAL_FORM);
      devLog('[AIABTesting] Test creado:', newTest);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      setFormError(e.response?.data?.error ?? e.response?.data?.message ?? 'Error al crear el test.');
      devError('[AIABTesting] Error al crear:', err);
    } finally {
      setCreating(false);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setForm(INITIAL_FORM);
    setFormError(null);
  };

  // ─── Formateo ────────────────────────────────────────────────────────────
  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  };

  const getVariantsCount = (test: ABTest): number => {
    if (typeof test.variantsCount === 'number') return test.variantsCount;
    if (Array.isArray(test.variants)) return test.variants.length;
    return 0;
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Flask className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Tests A/B de IA
              </h1>
              <p className="text-sm text-muted-foreground">
                Experimenta y compara variantes de prompts para optimizar resultados
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadTests} loading={loading}>
              <ArrowClockwise className="size-4" aria-hidden />
              Actualizar
            </Button>
            <Button size="sm" onClick={() => setModalOpen(true)}>
              <Plus className="size-4" weight="bold" aria-hidden />
              Crear Test
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
              aria-label="Cerrar aviso"
              onClick={() => setError(null)}
              className="flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-destructive/15"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* ── Stats Cards ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-center gap-2">
              <Flask className="size-[18px] text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">Total Tests</p>
            </div>
            {loading ? (
              <CircularProgress size="sm" />
            ) : (
              <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                {stats.total}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-center gap-2">
              <Circle className="size-[18px] text-success-text" weight="fill" aria-hidden />
              <p className="text-sm text-muted-foreground">Activos</p>
            </div>
            {loading ? (
              <CircularProgress size="sm" />
            ) : (
              <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-success-text">
                {stats.active}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="flex items-center gap-2">
              <CheckCircle className="size-[18px] text-primary" weight="fill" aria-hidden />
              <p className="text-sm text-muted-foreground">Completados</p>
            </div>
            {loading ? (
              <CircularProgress size="sm" />
            ) : (
              <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-primary">
                {stats.completed}
              </p>
            )}
          </div>
        </div>

        {/* ── Tabla de tests ─────────────────────────────────────────────────── */}
        <div>
          <h2 className="mb-3 text-base font-semibold text-foreground">Lista de Tests</h2>

          {loading ? (
            <div className="flex justify-center rounded-xl border border-border bg-card py-12">
              <CircularProgress size="lg" />
            </div>
          ) : tests.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-border bg-card px-4 py-12 text-center">
              <Flask className="size-12 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm font-medium text-foreground">
                No hay tests A/B creados aún
              </p>
              <p className="mt-1 mb-5 text-sm text-muted-foreground">
                Crea tu primer experimento para comparar variantes de prompts
              </p>
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus className="size-4" weight="bold" aria-hidden />
                Crear primer Test
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/[0.02]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left">
                      <th className="min-w-[200px] whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Nombre
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Estado
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Variantes
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Fecha inicio
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Ganador
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {tests.map((test) => {
                      const statusCfg = STATUS_CONFIG[test.status] ?? STATUS_CONFIG.draft;
                      const isActioning = actionLoading === test.id;

                      return (
                        <tr key={test.id} className="transition-colors hover:bg-accent/40">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-semibold text-foreground">{test.name}</p>
                              {test.description && (
                                <p className="text-xs text-muted-foreground">
                                  {test.description.substring(0, 60)}
                                  {test.description.length > 60 ? '...' : ''}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant={statusCfg.variant}>
                              {statusCfg.icon}
                              {statusCfg.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center tabular-nums text-foreground">
                            {getVariantsCount(test)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Clock className="size-3.5" aria-hidden />
                              <span className="text-xs">
                                {formatDate(test.startDate ?? test.createdAt)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {test.winner ? (
                              <div className="flex items-center gap-1.5">
                                <Trophy className="size-4 text-warning-text" weight="fill" aria-hidden />
                                <span className="text-sm text-warning-text">{test.winner}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {test.status === 'completed' ? 'Sin ganador' : '—'}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-1.5">
                              {(test.status === 'draft' || test.status === 'paused') && (
                                <button
                                  type="button"
                                  disabled={isActioning}
                                  onClick={() => handleStart(test.id)}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-success/14 px-3 text-xs font-medium text-success-text transition-colors hover:bg-success/20 disabled:cursor-not-allowed disabled:opacity-55"
                                >
                                  {isActioning ? (
                                    <CircularProgress size="sm" />
                                  ) : (
                                    <Play className="size-3.5" weight="fill" aria-hidden />
                                  )}
                                  Iniciar
                                </button>
                              )}
                              {test.status === 'running' && (
                                <button
                                  type="button"
                                  disabled={isActioning}
                                  onClick={() => handlePause(test.id)}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-warning/16 px-3 text-xs font-medium text-warning-text transition-colors hover:bg-warning/24 disabled:cursor-not-allowed disabled:opacity-55"
                                >
                                  {isActioning ? (
                                    <CircularProgress size="sm" />
                                  ) : (
                                    <Pause className="size-3.5" weight="fill" aria-hidden />
                                  )}
                                  Pausar
                                </button>
                              )}
                              {test.status === 'completed' && (
                                <Badge variant="primary">Finalizado</Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Crear Test ──────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open) closeModal(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Crear nuevo Test A/B</DialogTitle>
          </DialogHeader>

          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/12 px-3 py-2 text-sm text-destructive-text"
            >
              {formError}
            </div>
          )}

          <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="abtest-name">Nombre del test</Label>
              <input
                id="abtest-name"
                className={`${fieldClass} h-11 px-3.5`}
                placeholder="Ej: Test de tono de respuesta"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="abtest-description">Descripción (opcional)</Label>
              <textarea
                id="abtest-description"
                className={`${fieldClass} min-h-[64px] resize-y px-3.5 py-2.5`}
                rows={2}
                placeholder="Describe el objetivo del experimento..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="abtest-type">Tipo de test</Label>
              <Select
                value={form.testType}
                onValueChange={(val) => setForm({ ...form, testType: val as TestType })}
              >
                <SelectTrigger id="abtest-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TEST_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Variantes */}
            <p className="text-sm font-semibold text-foreground">
              Variantes ({form.variants.length})
            </p>
            {form.variants.map((v, idx) => (
              <div key={idx} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <input
                    className={`${fieldClass} h-9 flex-1 px-3`}
                    placeholder={`Variante ${idx + 1}`}
                    aria-label={`Nombre variante ${idx + 1}`}
                    value={v.name}
                    onChange={(e) => {
                      const updated = [...form.variants];
                      updated[idx] = { ...updated[idx], name: e.target.value };
                      setForm({ ...form, variants: updated });
                    }}
                  />
                  <Badge variant={idx === 0 ? 'primary' : 'neutral'}>
                    {idx === 0 ? 'Control' : `Var ${idx}`}
                  </Badge>
                  {form.variants.length > 2 && (
                    <RowAction
                      label="Eliminar variante"
                      className="hover:bg-destructive/10 hover:text-destructive-text"
                    >
                      <button
                        type="button"
                        aria-label="Eliminar variante"
                        onClick={() => {
                          const updated = form.variants.filter((_, i) => i !== idx);
                          setForm({ ...form, variants: updated });
                        }}
                        className="flex size-full items-center justify-center"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    </RowAction>
                  )}
                </div>
                <textarea
                  className={`${fieldClass} min-h-[56px] resize-y px-3 py-2 font-mono text-xs`}
                  rows={2}
                  aria-label={`Configuración variante ${idx + 1}`}
                  placeholder={
                    form.testType === 'classifier_prompt'
                      ? '{"classifierPrompt": "Tu prompt personalizado aquí... usa {CONVERSATION} como placeholder"}'
                      : '{"model": "gpt-4o", "temperature": 0.5}'
                  }
                  value={v.configJson}
                  onChange={(e) => {
                    const updated = [...form.variants];
                    updated[idx] = { ...updated[idx], configJson: e.target.value };
                    setForm({ ...form, variants: updated });
                  }}
                />
              </div>
            ))}
            {form.variants.length < 4 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForm({
                  ...form,
                  variants: [...form.variants, { name: `Variante ${String.fromCharCode(66 + form.variants.length - 1)}`, configJson: '{}' }]
                })}
              >
                <Plus className="size-4" weight="bold" aria-hidden />
                Agregar variante
              </Button>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={closeModal} disabled={creating}>
              Cancelar
            </Button>
            <Button
              size="sm"
              loading={creating}
              disabled={!form.name.trim()}
              onClick={handleCreate}
            >
              {!creating && <Plus className="size-4" weight="bold" aria-hidden />}
              Crear Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
