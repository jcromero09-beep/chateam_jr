/**
 * Página: AIImageGeneration
 * Página principal para la generación de imágenes con IA
 */

import { useState, useEffect, useCallback, useContext } from 'react';
import { CircularProgress } from '@mui/joy';
import {
  Sparkle,
  Plus,
  Image as ImageIcon,
  TrendUp,
  ClockCounterClockwise,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import CreditBalanceDisplay from '../components/CreditBalanceDisplay';
import ImageGenerationModal from '../components/ImageGenerationModal';
import ImageGenerationHistory from '../components/ImageGenerationHistory';
import aiImageGenerationApi from '../services/aiImageGenerationApi';
import { AuthContext } from '../context/Auth/AuthContext';
import { i18n } from "../translate/i18n"; // P3.47: i18n support

interface DashboardStats {
  totalGenerations: number;
  totalImages: number;
  totalCreditsUsed: number;
  recentGenerations: number;
}

export default function AIImageGeneration() {
  // P3.44: Helper para logging solo en desarrollo
  const isDev = import.meta.env.DEV;
  const devLog = (...args: any[]) => {
    if (isDev) console.log(...args);
  };
  const devError = (...args: any[]) => {
    if (isDev) console.error(...args);
  };

  // Auth context para socket (puede ser undefined si no está envuelto en provider)
  const authContext = useContext(AuthContext);
  const socket = authContext?.socket || null;

  // Estados
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Balance de créditos
  const [creditsBalance, setCreditsBalance] = useState(0);
  const [totalCreditsUsed, setTotalCreditsUsed] = useState(0);
  const [loadingCredits, setLoadingCredits] = useState(true);

  // Stats del dashboard
  const [stats, setStats] = useState<DashboardStats>({
    totalGenerations: 0,
    totalImages: 0,
    totalCreditsUsed: 0,
    recentGenerations: 0
  });

  // Trigger para refrescar historial
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Cargar balance de créditos
  const loadCreditsBalance = useCallback(async () => {
    try {
      setLoadingCredits(true);
      const response = await aiImageGenerationApi.getCreditsBalance();
      setCreditsBalance(response.balance);
      setTotalCreditsUsed(response.totalUsed);
    } catch (err: any) {
      devError('Error al cargar balance de créditos:', err);
      // No mostrar error si es solo de créditos
    } finally {
      setLoadingCredits(false);
    }
  }, []);

  // Cargar estadísticas del dashboard
  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Obtener generaciones para calcular stats
      const response = await aiImageGenerationApi.listGenerations({
        pageSize: 100 // Obtener suficientes para stats
      });

      const generations = response.generations;

      // Calcular estadísticas
      const totalGenerations = response.pagination.totalItems;
      const totalImages = generations.reduce((acc, gen) => acc + (gen.images?.length || 0), 0);
      const totalCredits = generations.reduce((acc, gen) => acc + gen.totalCreditsUsed, 0);

      // Generaciones recientes (últimas 24 horas)
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const recentGenerations = generations.filter(gen =>
        new Date(gen.createdAt) > yesterday
      ).length;

      setStats({
        totalGenerations,
        totalImages,
        totalCreditsUsed: totalCredits,
        recentGenerations
      });
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || i18n.t("aiModules.imageGeneration.toasts.errorLoadingStats");
      setError(errorMessage);
      devError('Error loading stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Cargar datos al montar
  useEffect(() => {
    loadCreditsBalance();
    loadStats();
  }, [loadCreditsBalance, loadStats]);

  // Escuchar eventos de Socket.IO para actualizaciones en tiempo real
  useEffect(() => {
    if (!socket) return;

    // P2.29: Generación completada - usar datos del evento cuando sea posible
    const handleGenerationCompleted = (data: any) => {
      devLog('Socket: generation completed', data);

      // P2.29: Si el evento incluye balance actualizado, usarlo directamente
      if (data.creditsBalance !== undefined) {
        setCreditsBalance(data.creditsBalance);
      } else {
        loadCreditsBalance();
      }

      // P2.29: Si el evento incluye stats, usarlos directamente
      if (data.stats) {
        setStats(data.stats);
      } else {
        loadStats();
      }

      setRefreshTrigger(prev => prev + 1);
    };

    // P2.29: Generación fallida - solo refrescar historial
    const handleGenerationFailed = (data: any) => {
      devLog('Socket: generation failed', data);
      // P2.29: No se consumen créditos en fallos, solo refrescar historial
      setRefreshTrigger(prev => prev + 1);
    };

    // P2.29: Créditos actualizados - usar datos del evento
    const handleCreditsUpdated = (data: any) => {
      devLog('Socket: credits updated', data);
      if (data.balance !== undefined) {
        setCreditsBalance(data.balance);
      }
      if (data.totalUsed !== undefined) {
        setTotalCreditsUsed(data.totalUsed);
      }
      // P2.29: Evitar refetch innecesario - los datos ya están en el evento
    };

    socket.on('ai-image-generation:completed', handleGenerationCompleted);
    socket.on('ai-image-generation:failed', handleGenerationFailed);
    socket.on('ai-image-generation:credits-updated', handleCreditsUpdated);

    return () => {
      socket.off('ai-image-generation:completed', handleGenerationCompleted);
      socket.off('ai-image-generation:failed', handleGenerationFailed);
      socket.off('ai-image-generation:credits-updated', handleCreditsUpdated);
    };
  }, [socket, loadCreditsBalance, loadStats]);

  // Manejar éxito de generación
  const handleGenerationSuccess = () => {
    loadCreditsBalance();
    loadStats();
    setRefreshTrigger(prev => prev + 1);
  };

  // Manejar refresh del historial
  const handleHistoryRefresh = () => {
    loadCreditsBalance();
    loadStats();
  };

  // Formatear número
  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('es-ES').format(num);
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
            <Sparkle className="size-6" weight="fill" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {i18n.t("aiModules.imageGeneration.title")}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {i18n.t("aiModules.imageGeneration.description")}
            </p>
          </div>
        </div>

        <Button
          size="lg"
          onClick={() => setModalOpen(true)}
          disabled={loadingCredits || creditsBalance <= 0}
        >
          <Plus className="size-4" weight="bold" aria-hidden />
          {i18n.t("aiModules.imageGeneration.buttons.newGeneration")}
        </Button>
      </div>

      {/* Error global */}
      {error && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text"
        >
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Balance de Créditos */}
        <CreditBalanceDisplay
          balance={creditsBalance}
          totalUsed={totalCreditsUsed}
          loading={loadingCredits}
        />

        {/* Total Generaciones */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="mb-1 flex items-center gap-2">
            <ClockCounterClockwise className="size-5 text-primary" aria-hidden />
            <span className="text-sm text-muted-foreground">
              {i18n.t("aiModules.imageGeneration.stats.totalGenerations")}
            </span>
          </div>
          {loading ? (
            <CircularProgress size="sm" />
          ) : (
            <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
              {formatNumber(stats.totalGenerations)}
            </p>
          )}
        </div>

        {/* Total Imágenes */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="mb-1 flex items-center gap-2">
            <ImageIcon className="size-5 text-success" aria-hidden />
            <span className="text-sm text-muted-foreground">
              {i18n.t("aiModules.imageGeneration.stats.imagesGenerated")}
            </span>
          </div>
          {loading ? (
            <CircularProgress size="sm" />
          ) : (
            <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
              {formatNumber(stats.totalImages)}
            </p>
          )}
        </div>

        {/* Generaciones Recientes */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="mb-1 flex items-center gap-2">
            <TrendUp className="size-5 text-warning" aria-hidden />
            <span className="text-sm text-muted-foreground">
              {i18n.t("aiModules.imageGeneration.stats.last24Hours")}
            </span>
          </div>
          {loading ? (
            <CircularProgress size="sm" />
          ) : (
            <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
              {formatNumber(stats.recentGenerations)}
            </p>
          )}
        </div>
      </div>

      {/* Historial */}
      <div className="mb-4">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {i18n.t("aiModules.imageGeneration.history.title")}
        </h2>
        <ImageGenerationHistory
          onRefresh={handleHistoryRefresh}
          refreshTrigger={refreshTrigger}
        />
      </div>

      {/* Modal de Generación */}
      <ImageGenerationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleGenerationSuccess}
        currentBalance={creditsBalance}
      />
    </div>
  );
}
