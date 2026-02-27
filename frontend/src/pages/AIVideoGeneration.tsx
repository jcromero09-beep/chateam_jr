/**
 * Página: AIVideoGeneration
 * Página principal para la generación de videos con IA
 */

import { useState, useEffect, useCallback, useContext } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert
} from '@mui/joy';
import VideocamIcon from '@mui/icons-material/Videocam';
import AddIcon from '@mui/icons-material/Add';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import HistoryIcon from '@mui/icons-material/History';

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
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          gap: 2,
          mb: 3
        }}
      >
        <Box>
          <Typography level="h2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <VideocamIcon sx={{ color: 'primary.500' }} />
            Generacion de Videos con IA
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary', mt: 0.5 }}>
            Genera videos con IA usando OpenAI Sora
          </Typography>
        </Box>

        <Button
          size="lg"
          startDecorator={<AddIcon />}
          onClick={() => setModalOpen(true)}
          disabled={loadingCredits || creditsBalance <= 0}
        >
          Nueva Generacion
        </Button>
      </Box>

      {/* Error global */}
      {error && (
        <Alert color="danger" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Balance de Créditos */}
        <Grid xs={12} sm={6} md={3}>
          <CreditBalanceDisplay
            balance={creditsBalance}
            totalUsed={totalCreditsUsed}
            loading={loadingCredits}
          />
        </Grid>

        {/* Total Generaciones */}
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <HistoryIcon sx={{ fontSize: 20, color: 'primary.500' }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Total Generaciones
                </Typography>
              </Box>
              {loading ? (
                <CircularProgress size="sm" />
              ) : (
                <Typography level="h3">
                  {formatNumber(stats.totalGenerations)}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Total Videos */}
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <VideoLibraryIcon sx={{ fontSize: 20, color: 'success.500' }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Videos Generados
                </Typography>
              </Box>
              {loading ? (
                <CircularProgress size="sm" />
              ) : (
                <Typography level="h3">
                  {formatNumber(stats.totalVideos)}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Generaciones Recientes */}
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <TrendingUpIcon sx={{ fontSize: 20, color: 'warning.500' }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  Ultimas 24 Horas
                </Typography>
              </Box>
              {loading ? (
                <CircularProgress size="sm" />
              ) : (
                <Typography level="h3">
                  {formatNumber(stats.recentGenerations)}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Historial */}
      <Box sx={{ mb: 2 }}>
        <Typography level="h4" sx={{ mb: 2 }}>
          Historial de Generaciones
        </Typography>
        <VideoGenerationHistory
          onRefresh={handleHistoryRefresh}
          refreshTrigger={refreshTrigger}
        />
      </Box>

      {/* Modal de Generación */}
      <VideoGenerationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleGenerationSuccess}
        currentBalance={creditsBalance}
      />
    </Box>
  );
}
