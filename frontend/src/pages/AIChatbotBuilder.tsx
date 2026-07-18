/**
 * Página: AIChatbotBuilder
 * Constructor de Chatbots — creación, configuración y entrenamiento.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ChatCircleDots,
  PlusCircle,
  Barbell,
  X,
  ArrowClockwise,
  Tray,
  Robot,
  Database,
  Pulse,
  CheckCircle,
  XCircle,
  Cpu,
  CircleNotch,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
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

const STATUS_VARIANTS: Record<Chatbot['status'], BadgeProps['variant']> = {
  active: 'success',
  inactive: 'neutral',
  training: 'warning',
  error: 'destructive',
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

  const closeModal = () => {
    setModalOpen(false);
    setForm(INITIAL_FORM);
    setFormError(null);
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

  const numberFmt = new Intl.NumberFormat('es-ES');

  const statCards = [
    {
      label: 'Total Chatbots',
      value: stats.total,
      icon: <Robot className="size-5" weight="fill" aria-hidden />,
      iconTone: 'text-primary',
    },
    {
      label: 'Activos',
      value: stats.active,
      icon: <Pulse className="size-5" weight="bold" aria-hidden />,
      iconTone: 'text-success-text',
    },
    {
      label: 'Data Sources',
      value: stats.totalDatasources,
      icon: <Database className="size-5" weight="fill" aria-hidden />,
      iconTone: 'text-warning-text',
    },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <ChatCircleDots className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Constructor de Chatbots
              </h1>
              <p className="text-sm text-muted-foreground">
                Crea, configura y entrena chatbots personalizados para tu empresa
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Recargar"
              className="text-muted-foreground"
              onClick={loadData}
              disabled={loading}
            >
              <ArrowClockwise className="size-5" aria-hidden />
            </Button>
            <Button size="sm" onClick={handleOpenModal}>
              <PlusCircle className="size-4" weight="bold" aria-hidden />
              Crear Chatbot
            </Button>
          </div>
        </div>

        {/* Alertas */}
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
              className="flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-destructive/15"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}
        {successMsg && (
          <div
            role="status"
            className="flex items-start justify-between gap-3 rounded-lg border border-success/30 bg-success/14 px-4 py-3 text-sm text-success-text"
          >
            <span>{successMsg}</span>
            <button
              type="button"
              aria-label="Cerrar alerta"
              onClick={() => setSuccessMsg(null)}
              className="flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-success/20"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]"
            >
              <div className="flex items-center gap-2">
                <span className={card.iconTone}>{card.icon}</span>
                <p className="text-sm text-muted-foreground">{card.label}</p>
              </div>
              {loading ? (
                <CircleNotch className="mt-2 size-6 animate-spin text-muted-foreground" aria-hidden />
              ) : (
                <p className="mt-1.5 text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                  {numberFmt.format(card.value)}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Grid de chatbots */}
        {loading ? (
          <div className="flex justify-center py-16">
            <CircleNotch className="size-10 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : chatbots.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/30 p-6">
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Tray className="size-12 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">
                No tienes chatbots creados aún
              </p>
              <Button size="sm" onClick={handleOpenModal}>
                <PlusCircle className="size-4" weight="bold" aria-hidden />
                Crear primer chatbot
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {chatbots.map((chatbot) => (
              <div
                key={chatbot.id}
                className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]"
              >
                {/* Cabecera */}
                <div className="mb-1 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Robot className="size-5 shrink-0 text-primary" weight="fill" aria-hidden />
                    <span className="font-semibold text-foreground">{chatbot.name}</span>
                  </div>
                  <Badge variant={STATUS_VARIANTS[chatbot.status] ?? 'neutral'}>
                    {chatbot.status === 'active' ? (
                      <CheckCircle className="size-3" weight="fill" aria-hidden />
                    ) : chatbot.status === 'error' ? (
                      <XCircle className="size-3" weight="fill" aria-hidden />
                    ) : null}
                    {STATUS_LABELS[chatbot.status] ?? chatbot.status}
                  </Badge>
                </div>

                {/* Descripción */}
                {chatbot.description && (
                  <p className="mb-1.5 min-h-8 text-xs text-muted-foreground">
                    {chatbot.description.length > 80
                      ? `${chatbot.description.substring(0, 80)}...`
                      : chatbot.description}
                  </p>
                )}

                {/* Meta info */}
                <div className="mb-4 flex flex-wrap gap-4">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Database className="size-3.5" aria-hidden />
                    <span>{chatbot.datasourcesCount ?? 0} fuentes</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Cpu className="size-3.5" aria-hidden />
                    <span>{chatbot.model}</span>
                  </div>
                </div>

                {/* Botón entrenar */}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-auto w-full"
                  loading={trainingId === chatbot.id}
                  disabled={chatbot.status === 'training'}
                  onClick={() => handleTrain(chatbot.id)}
                >
                  {trainingId === chatbot.id ? null : (
                    <Barbell className="size-4" aria-hidden />
                  )}
                  {chatbot.status === 'training' ? 'Entrenando...' : 'Entrenar'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal crear chatbot */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                Crear nuevo Chatbot
              </h2>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={closeModal}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <X className="size-[18px]" aria-hidden />
              </button>
            </div>

            {formError && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text"
              >
                {formError}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="chatbot-name">
                  Nombre del Chatbot <span className="text-destructive-text">*</span>
                </Label>
                <input
                  id="chatbot-name"
                  placeholder="Ej. Asistente de Ventas"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  autoFocus
                  className="h-11 w-full rounded-md border border-input bg-card px-3.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="chatbot-description">Descripción</Label>
                <textarea
                  id="chatbot-description"
                  placeholder="Describe el propósito del chatbot..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={closeModal}>
                  Cancelar
                </Button>
                <Button size="sm" loading={creating} onClick={handleCreate}>
                  {!creating && <PlusCircle className="size-4" weight="bold" aria-hidden />}
                  Crear Chatbot
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
