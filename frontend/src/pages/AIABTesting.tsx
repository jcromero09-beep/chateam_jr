/**
 * Página: AIABTesting
 * Tests A/B de IA — gestión y seguimiento de experimentos
 * Módulo: ai_ab_testing
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
  Input,
  Textarea,
  FormControl,
  FormLabel,
  Select,
  Option,
  Modal,
  ModalDialog,
  ModalClose,
  Table,
  Sheet,
  Chip,
  IconButton,
} from '@mui/joy';
import {
  FlaskConical,
  Plus,
  Play,
  Pause,
  RefreshCw,
  Trophy,
  X,
  CheckCircle2,
  CircleDot,
  Clock,
  FileText,
} from 'lucide-react';
import api from '../services/api';

// Logging solo en desarrollo
const isDev = import.meta.env.DEV;
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args); };
const devError = (...args: unknown[]) => { if (isDev) console.error(...args); };

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
  { label: string; color: 'neutral' | 'primary' | 'warning' | 'success' | 'danger'; icon: React.ReactNode }
> = {
  draft: { label: 'Borrador', color: 'neutral', icon: <FileText size={12} /> },
  running: { label: 'Activo', color: 'success', icon: <CircleDot size={12} /> },
  paused: { label: 'Pausado', color: 'warning', icon: <Pause size={12} /> },
  completed: { label: 'Completado', color: 'primary', icon: <CheckCircle2 size={12} /> },
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
            <FlaskConical size={28} color="var(--joy-palette-primary-500)" />
            Tests A/B de IA
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary', mt: 0.5 }}>
            Experimenta y compara variantes de prompts para optimizar resultados
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startDecorator={<RefreshCw size={14} />}
            onClick={loadTests}
            loading={loading}
          >
            Actualizar
          </Button>
          <Button startDecorator={<Plus size={16} />} onClick={() => setModalOpen(true)}>
            Crear Test
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
        <Grid xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <FlaskConical size={18} color="var(--joy-palette-neutral-500)" />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Total Tests
                </Typography>
              </Box>
              {loading ? (
                <CircularProgress size="sm" />
              ) : (
                <Typography level="h3">{stats.total}</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CircleDot size={18} color="var(--joy-palette-success-500)" />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Activos
                </Typography>
              </Box>
              {loading ? (
                <CircularProgress size="sm" />
              ) : (
                <Typography level="h3" sx={{ color: 'success.500' }}>
                  {stats.active}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid xs={12} sm={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CheckCircle2 size={18} color="var(--joy-palette-primary-500)" />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Completados
                </Typography>
              </Box>
              {loading ? (
                <CircularProgress size="sm" />
              ) : (
                <Typography level="h3" sx={{ color: 'primary.500' }}>
                  {stats.completed}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Tabla de tests ─────────────────────────────────────────────────── */}
      <Card>
        <CardContent>
          <Typography level="title-md" sx={{ mb: 2 }}>
            Lista de Tests
          </Typography>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size="lg" />
            </Box>
          ) : tests.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8, color: 'text.tertiary' }}>
              <FlaskConical size={48} />
              <Typography level="body-md" sx={{ mt: 2 }}>
                No hay tests A/B creados aún
              </Typography>
              <Typography level="body-sm" sx={{ mt: 0.5, mb: 3 }}>
                Crea tu primer experimento para comparar variantes de prompts
              </Typography>
              <Button startDecorator={<Plus size={16} />} onClick={() => setModalOpen(true)}>
                Crear primer Test
              </Button>
            </Box>
          ) : (
            <Sheet sx={{ overflow: 'auto', borderRadius: 'sm' }}>
              <Table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 200 }}>Nombre</th>
                    <th style={{ width: 130, textAlign: 'center' }}>Estado</th>
                    <th style={{ width: 100, textAlign: 'center' }}>Variantes</th>
                    <th style={{ width: 130 }}>Fecha inicio</th>
                    <th style={{ width: 160 }}>Ganador</th>
                    <th style={{ width: 120, textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tests.map((test) => {
                    const statusCfg = STATUS_CONFIG[test.status] ?? STATUS_CONFIG.draft;
                    const isActioning = actionLoading === test.id;

                    return (
                      <tr key={test.id}>
                        <td>
                          <Box>
                            <Typography level="body-sm" fontWeight="lg">
                              {test.name}
                            </Typography>
                            {test.description && (
                              <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                {test.description.substring(0, 60)}
                                {test.description.length > 60 ? '...' : ''}
                              </Typography>
                            )}
                          </Box>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Chip
                            size="sm"
                            color={statusCfg.color}
                            variant="soft"
                            startDecorator={statusCfg.icon}
                          >
                            {statusCfg.label}
                          </Chip>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <Typography level="body-sm">{getVariantsCount(test)}</Typography>
                        </td>
                        <td>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Clock size={12} color="var(--joy-palette-text-tertiary)" />
                            <Typography level="body-xs">
                              {formatDate(test.startDate ?? test.createdAt)}
                            </Typography>
                          </Box>
                        </td>
                        <td>
                          {test.winner ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Trophy size={14} color="var(--joy-palette-warning-500)" />
                              <Typography level="body-sm" sx={{ color: 'warning.600' }}>
                                {test.winner}
                              </Typography>
                            </Box>
                          ) : (
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              {test.status === 'completed' ? 'Sin ganador' : '—'}
                            </Typography>
                          )}
                        </td>
                        <td>
                          <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                            {(test.status === 'draft' || test.status === 'paused') && (
                              <Button
                                size="sm"
                                color="success"
                                variant="soft"
                                startDecorator={
                                  isActioning ? <CircularProgress size="sm" /> : <Play size={14} />
                                }
                                disabled={isActioning}
                                onClick={() => handleStart(test.id)}
                              >
                                Iniciar
                              </Button>
                            )}
                            {test.status === 'running' && (
                              <Button
                                size="sm"
                                color="warning"
                                variant="soft"
                                startDecorator={
                                  isActioning ? <CircularProgress size="sm" /> : <Pause size={14} />
                                }
                                disabled={isActioning}
                                onClick={() => handlePause(test.id)}
                              >
                                Pausar
                              </Button>
                            )}
                            {test.status === 'completed' && (
                              <Chip size="sm" color="primary" variant="plain">
                                Finalizado
                              </Chip>
                            )}
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

      {/* ── Modal Crear Test ──────────────────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setForm(INITIAL_FORM); setFormError(null); }}>
        <ModalDialog sx={{ minWidth: { xs: '90vw', sm: 480 } }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            Crear nuevo Test A/B
          </Typography>

          {formError && (
            <Alert color="danger" size="sm" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl required>
              <FormLabel>Nombre del test</FormLabel>
              <Input
                placeholder="Ej: Test de tono de respuesta"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Descripción (opcional)</FormLabel>
              <Textarea
                placeholder="Describe el objetivo del experimento..."
                minRows={2}
                maxRows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </FormControl>

            <FormControl required>
              <FormLabel>Tipo de test</FormLabel>
              <Select
                value={form.testType}
                onChange={(_e, val) => val && setForm({ ...form, testType: val as TestType })}
              >
                {Object.entries(TEST_TYPE_LABELS).map(([key, label]) => (
                  <Option key={key} value={key}>{label}</Option>
                ))}
              </Select>
            </FormControl>

            {/* Variantes */}
            <Typography level="title-sm" sx={{ mt: 1 }}>
              Variantes ({form.variants.length})
            </Typography>
            {form.variants.map((v, idx) => (
              <Card key={idx} variant="outlined" size="sm" sx={{ p: 1.5 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
                  <Input
                    size="sm"
                    placeholder={`Variante ${idx + 1}`}
                    value={v.name}
                    onChange={(e) => {
                      const updated = [...form.variants];
                      updated[idx] = { ...updated[idx], name: e.target.value };
                      setForm({ ...form, variants: updated });
                    }}
                    sx={{ flex: 1 }}
                  />
                  <Chip size="sm" variant="soft" color={idx === 0 ? 'primary' : 'neutral'}>
                    {idx === 0 ? 'Control' : `Var ${idx}`}
                  </Chip>
                  {form.variants.length > 2 && (
                    <IconButton
                      size="sm"
                      variant="plain"
                      color="danger"
                      onClick={() => {
                        const updated = form.variants.filter((_, i) => i !== idx);
                        setForm({ ...form, variants: updated });
                      }}
                    >
                      <X size={14} />
                    </IconButton>
                  )}
                </Box>
                <Textarea
                  size="sm"
                  minRows={2}
                  maxRows={5}
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
              </Card>
            ))}
            {form.variants.length < 4 && (
              <Button
                size="sm"
                variant="soft"
                onClick={() => setForm({
                  ...form,
                  variants: [...form.variants, { name: `Variante ${String.fromCharCode(66 + form.variants.length - 1)}`, configJson: '{}' }]
                })}
              >
                + Agregar variante
              </Button>
            )}

            <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end', mt: 1 }}>
              <Button
                variant="outlined"
                onClick={() => { setModalOpen(false); setForm(INITIAL_FORM); setFormError(null); }}
                disabled={creating}
              >
                Cancelar
              </Button>
              <Button
                startDecorator={creating ? <CircularProgress size="sm" /> : <Plus size={16} />}
                loading={creating}
                disabled={!form.name.trim()}
                onClick={handleCreate}
              >
                Crear Test
              </Button>
            </Box>
          </Box>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
