/**
 * Página: AIVideoGeneration
 * Página principal para la generación de videos con IA
 */

import { useState, useEffect, useCallback, useContext } from 'react';
import { CircularProgress } from '@mui/joy';
import {
  VideoCamera,
  Plus,
  FilmStrip,
  TrendUp,
  ClockCounterClockwise,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import CreditBalanceDisplay from '../components/CreditBalanceDisplay';
import VideoGenerationModal from '../components/VideoGenerationModal';
import VideoGenerationHistory from '../components/VideoGenerationHistory';
import aiVideoGenerationApi from '../services/aiVideoGenerationApi';
import { AuthContext } from '../context/Auth/AuthContext';

interface DashboardStats {
  totalGenerations: number;
  totalVideos: number;
  totalCreditsUsed: number;
  recentGenerations: number;
}

export default function AIVideoGeneration() {
  // Helper para logging solo en desarrollo
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
    totalVideos: 0,
    totalCreditsUsed: 0,
    recentGenerations: 0
  });

  // Trigger para refrescar historial
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Cargar balance de créditos
  const loadCreditsBalance = useCallback(async () => {
    try {
      setLoadingCredits(true);
      const response = await aiVideoGenerationApi.getCreditsBalance();
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
      const response = await aiVideoGenerationApi.listGenerations({
        pageSize: 100 // Obtener suficientes para stats
      });

      const generations = response.generations;

      // Calcular estadísticas
      const totalGenerations = response.pagination.totalItems;
      const totalVideos = generations.reduce((acc, gen) => acc + (gen.videos?.length || 0), 0);
      const totalCredits = generations.reduce((acc, gen) => acc + gen.totalCreditsUsed, 0);

      // Generaciones recientes (últimas 24 horas)
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const recentGenerations = generations.filter(gen =>
        new Date(gen.createdAt) > yesterday
      ).length;

      setStats({
        totalGenerations,
        totalVideos,
        totalCreditsUsed: totalCredits,
        recentGenerations
      });
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Error al cargar las estadísticas';
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

    // Generación completada - usar datos del evento cuando sea posible
    const handleGenerationCompleted = (data: any) => {
      devLog('Socket: video generation completed', data);

      // Si el evento incluye balance actualizado, usarlo directamente
      if (data.creditsBalance !== undefined) {
        setCreditsBalance(data.creditsBalance);
      } else {
        loadCreditsBalance();
      }

      // Si el evento incluye stats, usarlos directamente
      if (data.stats) {
        setStats(data.stats);
      } else {
        loadStats();
      }

      setRefreshTrigger(prev => prev + 1);
    };

    // Generación fallida - solo refrescar historial
    const handleGenerationFailed = (data: any) => {
      devLog('Socket: video generation failed', data);
      // No se consumen créditos en fallos, solo refrescar historial
      setRefreshTrigger(prev => prev + 1);
    };

    // Créditos actualizados - usar datos del evento
    const handleCreditsUpdated = (data: any) => {
      devLog('Socket: credits updated', data);
      if (data.balance !== undefined) {
        setCreditsBalance(data.balance);
      }
      if (data.totalUsed !== undefined) {
        setTotalCreditsUsed(data.totalUsed);
      }
      // Evitar refetch innecesario - los datos ya están en el evento
    };

    socket.on('ai-video-generation:completed', handleGenerationCompleted);
    socket.on('ai-video-generation:failed', handleGenerationFailed);
    socket.on('ai-video-generation:credits-updated', handleCreditsUpdated);

    return () => {
      socket.off('ai-video-generation:completed', handleGenerationCompleted);
      socket.off('ai-video-generation:failed', handleGenerationFailed);
      socket.off('ai-video-generation:credits-updated', handleCreditsUpdated);
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
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <VideoCamera className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Generacion de Videos con IA
              </h1>
              <p className="text-sm text-muted-foreground">
                Genera videos con IA usando OpenAI Sora
              </p>
            </div>
          </div>

          <Button
            size="lg"
            onClick={() => setModalOpen(true)}
            disabled={loadingCredits || creditsBalance <= 0}
          >
            <Plus className="size-4" weight="bold" aria-hidden />
            Nueva Generacion
          </Button>
        </div>

        {/* Error global */}
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-text"
          >
            {error}
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          {/* Balance de Créditos */}
          <CreditBalanceDisplay
            balance={creditsBalance}
            totalUsed={totalCreditsUsed}
            loading={loadingCredits}
          />

          {/* Total Generaciones */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="mb-1 flex items-center gap-2">
              <ClockCounterClockwise className="size-5 text-brand-teal" aria-hidden />
              <span className="text-sm text-muted-foreground">
                Total Generaciones
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

          {/* Total Videos */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="mb-1 flex items-center gap-2">
              <FilmStrip className="size-5 text-success-text" aria-hidden />
              <span className="text-sm text-muted-foreground">
                Videos Generados
              </span>
            </div>
            {loading ? (
              <CircularProgress size="sm" />
            ) : (
              <p className="text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                {formatNumber(stats.totalVideos)}
              </p>
            )}
          </div>

          {/* Generaciones Recientes */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
            <div className="mb-1 flex items-center gap-2">
              <TrendUp className="size-5 text-warning-text" aria-hidden />
              <span className="text-sm text-muted-foreground">
                Ultimas 24 Horas
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
        <div>
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Historial de Generaciones
          </h2>
          <VideoGenerationHistory
            onRefresh={handleHistoryRefresh}
            refreshTrigger={refreshTrigger}
          />
        </div>
      </div>

      {/* Modal de Generación */}
      <VideoGenerationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleGenerationSuccess}
        currentBalance={creditsBalance}
      />
    </div>
  );
}
