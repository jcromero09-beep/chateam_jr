/**
 * Página: AIChatbotBuilder
 * Constructor de Chatbots — creación, configuración y entrenamiento.
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
  Button,
  Chip,
  Modal,
  ModalDialog,
  ModalClose,
  FormControl,
  FormLabel,
  Input,
  Textarea,
} from '@mui/joy';
import {
  MessageSquare,
  PlusCircle,
  Dumbbell,
  X,
  RefreshCw,
  Inbox,
  Bot,
  Database,
  Activity,
  CheckCircle,
  XCircle,
  Cpu,
} from 'lucide-react';
import api from '../services/api';

// Helpers de logging para desarrollo
const isDev = import.meta.env.DEV;
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args); };
const devError = (...args: unknown[]) => { if (isDev) console.error(...args); };

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface Chatbot {
  id: number;
  name: string;
  description?: string;
  status: 'active' | 'inactive' | 'training' | 'error';
  datasourcesCount: number;
  model: string;
  createdAt: string;
}

interface ChatbotStats {
  total: number;
  active: number;
  totalDatasources: number;
}

interface CreateChatbotForm {
  name: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<Chatbot['status'], string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  training: 'Entrenando',
  error: 'Error',
};

const STATUS_COLORS: Record<Chatbot['status'], 'success' | 'neutral' | 'warning' | 'danger'> = {
  active: 'success',
  inactive: 'neutral',
  training: 'warning',
  error: 'danger',
};

const INITIAL_FORM: CreateChatbotForm = { name: '', description: '' };

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function AIChatbotBuilder() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [stats, setStats] = useState<ChatbotStats>({ total: 0, active: 0, totalDatasources: 0 });

  // Modal crear
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CreateChatbotForm>(INITIAL_FORM);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Entrenamiento
  const [trainingId, setTrainingId] = useState<number | null>(null);

  // ---------------------------------------------------------------------------
  // Carga de datos
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [chatbotsResult, statsResult] = await Promise.allSettled([
        api.get('/ai/chatbots'),
        api.get('/ai/chatbots/stats'),
      ]);

      // Chatbots
      if (chatbotsResult.status === 'fulfilled') {
        const payload = chatbotsResult.value.data as unknown as { data?: Chatbot[] } | Chatbot[];
        const list: Chatbot[] = Array.isArray(payload)
          ? payload
          : ((payload as { data?: Chatbot[] }).data ?? []);
        setChatbots(list);
        devLog('[AIChatbotBuilder] Chatbots cargados:', list.length);
      } else {
        const reason = chatbotsResult.reason as { response?: { data?: { error?: string } } };
        devError('[AIChatbotBuilder] Error al cargar chatbots:', chatbotsResult.reason);
        throw new Error(reason?.response?.data?.error ?? 'Error al cargar chatbots');
      }

      // Stats
      if (statsResult.status === 'fulfilled') {
        const payload = statsResult.value.data as unknown as { data?: ChatbotStats } | ChatbotStats;
        const s: ChatbotStats = (
          !Array.isArray(payload) && (payload as { data?: ChatbotStats }).data
            ? (payload as { data: ChatbotStats }).data
            : payload
        ) as ChatbotStats;
        setStats({
          total: s.total ?? 0,
          active: s.active ?? 0,
          totalDatasources: s.totalDatasources ?? 0,
        });
        devLog('[AIChatbotBuilder] Stats:', s);
      } else {
        devError('[AIChatbotBuilder] Error al cargar stats:', statsResult.reason);
        // Stats no críticas
      }
    } catch (err: unknown) {
      const message = (err as Error).message ?? 'Error al cargar los chatbots';
      devError('[AIChatbotBuilder] Error general:', err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---------------------------------------------------------------------------
  // Crear chatbot
  // ---------------------------------------------------------------------------

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setFormError('El nombre del chatbot es obligatorio');
      return;
    }

    try {
      setCreating(true);
      setFormError(null);
      devLog('[AIChatbotBuilder] Creando chatbot:', form.name);

      await api.post('/ai/chatbots', {
        name: form.name.trim(),
        description: form.description.trim(),
      });

      setSuccessMsg('Chatbot creado correctamente');
      setModalOpen(false);
      setForm(INITIAL_FORM);
      await loadData();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Error al crear el chatbot';
      devError('[AIChatbotBuilder] Error al crear:', err);
      setFormError(message);
    } finally {
      setCreating(false);
    }
  };

  const handleOpenModal = () => {
    setForm(INITIAL_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  // ---------------------------------------------------------------------------
  // Entrenar chatbot
  // ---------------------------------------------------------------------------

  const handleTrain = async (chatbotId: number) => {
    try {
      setTrainingId(chatbotId);
      setError(null);
      devLog('[AIChatbotBuilder] Entrenando chatbot:', chatbotId);

      await api.post(`/ai/chatbots/${chatbotId}/train`);
      setSuccessMsg('Entrenamiento iniciado correctamente');
      await loadData();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Error al iniciar el entrenamiento';
      devError('[AIChatbotBuilder] Error al entrenar:', err);
      setError(message);
    } finally {
      setTrainingId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const statCards = [
    {
      label: 'Total Chatbots',
      value: stats.total,
      icon: <Bot size={20} color="var(--joy-palette-primary-500)" />,
    },
    {
      label: 'Activos',
      value: stats.active,
      icon: <Activity size={20} color="var(--joy-palette-success-500)" />,
    },
    {
      label: 'Data Sources',
      value: stats.totalDatasources,
      icon: <Database size={20} color="var(--joy-palette-warning-500)" />,
    },
  ];

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <MessageSquare size={32} color="var(--joy-palette-primary-500)" />
          <Box>
            <Typography level="h2">Constructor de Chatbots</Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              Crea, configura y entrena chatbots personalizados para tu empresa
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton variant="outlined" onClick={loadData} disabled={loading} title="Recargar">
            <RefreshCw size={18} />
          </IconButton>
          <Button
            startDecorator={<PlusCircle size={18} />}
            onClick={handleOpenModal}
          >
            Crear Chatbot
          </Button>
        </Box>
      </Box>

      {/* Alertas */}
      {error && (
        <Alert
          color="danger"
          sx={{ mb: 2 }}
          endDecorator={
            <IconButton size="sm" variant="plain" color="danger" onClick={() => setError(null)}>
              <X size={16} />
            </IconButton>
          }
        >
          {error}
        </Alert>
      )}
      {successMsg && (
        <Alert
          color="success"
          sx={{ mb: 2 }}
          endDecorator={
            <IconButton size="sm" variant="plain" color="success" onClick={() => setSuccessMsg(null)}>
              <X size={16} />
            </IconButton>
          }
        >
          {successMsg}
        </Alert>
      )}

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {statCards.map((card) => (
          <Grid key={card.label} xs={12} sm={4}>
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
                  <Typography level="h3">
                    {new Intl.NumberFormat('es-ES').format(card.value)}
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Grid de chatbots */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size="lg" />
        </Box>
      ) : chatbots.length === 0 ? (
        <Card variant="soft" color="neutral">
          <CardContent>
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Inbox size={48} color="var(--joy-palette-neutral-400)" style={{ marginBottom: 12 }} />
              <Typography level="body-md" sx={{ color: 'text.tertiary', mb: 1 }}>
                No tienes chatbots creados aún
              </Typography>
              <Button
                startDecorator={<PlusCircle size={16} />}
                onClick={handleOpenModal}
              >
                Crear primer chatbot
              </Button>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {chatbots.map((chatbot) => (
            <Grid key={chatbot.id} xs={12} sm={6} md={4}>
              <Card variant="outlined">
                <CardContent>
                  {/* Cabecera */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Bot size={20} color="var(--joy-palette-primary-500)" />
                      <Typography level="title-md">{chatbot.name}</Typography>
                    </Box>
                    <Chip
                      size="sm"
                      color={STATUS_COLORS[chatbot.status] ?? 'neutral'}
                      variant="soft"
                      startDecorator={
                        chatbot.status === 'active'
                          ? <CheckCircle size={12} />
                          : chatbot.status === 'error'
                          ? <XCircle size={12} />
                          : undefined
                      }
                    >
                      {STATUS_LABELS[chatbot.status] ?? chatbot.status}
                    </Chip>
                  </Box>

                  {/* Descripción */}
                  {chatbot.description && (
                    <Typography
                      level="body-xs"
                      sx={{ color: 'text.tertiary', mb: 1.5, minHeight: 32 }}
                    >
                      {chatbot.description.length > 80
                        ? `${chatbot.description.substring(0, 80)}...`
                        : chatbot.description}
                    </Typography>
                  )}

                  {/* Meta info */}
                  <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Database size={13} color="var(--joy-palette-neutral-400)" />
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {chatbot.datasourcesCount ?? 0} fuentes
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Cpu size={13} color="var(--joy-palette-neutral-400)" />
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {chatbot.model}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Botón entrenar */}
                  <Button
                    size="sm"
                    variant="outlined"
                    color="primary"
                    fullWidth
                    startDecorator={<Dumbbell size={14} />}
                    loading={trainingId === chatbot.id}
                    disabled={chatbot.status === 'training'}
                    onClick={() => handleTrain(chatbot.id)}
                  >
                    {chatbot.status === 'training' ? 'Entrenando...' : 'Entrenar'}
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Modal crear chatbot */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <ModalDialog sx={{ minWidth: 480 }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            Crear nuevo Chatbot
          </Typography>

          {formError && (
            <Alert color="danger" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl required>
              <FormLabel>Nombre del Chatbot</FormLabel>
              <Input
                placeholder="Ej. Asistente de Ventas"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </FormControl>

            <FormControl>
              <FormLabel>Descripción</FormLabel>
              <Textarea
                placeholder="Describe el propósito del chatbot..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                minRows={3}
              />
            </FormControl>

            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
              <Button variant="outlined" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                startDecorator={<PlusCircle size={16} />}
                loading={creating}
                onClick={handleCreate}
              >
                Crear Chatbot
              </Button>
            </Box>
          </Box>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
