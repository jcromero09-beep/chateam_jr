/**
 * Página: AIImageGeneration
 * Página principal para la generación de imágenes con IA
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
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import AddIcon from '@mui/icons-material/Add';
import ImageIcon from '@mui/icons-material/Image';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import HistoryIcon from '@mui/icons-material/History';

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
            <AutoAwesomeIcon sx={{ color: 'primary.500' }} />
            {i18n.t("aiModules.imageGeneration.title")}
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary', mt: 0.5 }}>
            {i18n.t("aiModules.imageGeneration.description")}
          </Typography>
        </Box>

        <Button
          size="lg"
          startDecorator={<AddIcon />}
          onClick={() => setModalOpen(true)}
          disabled={loadingCredits || creditsBalance <= 0}
        >
          {i18n.t("aiModules.imageGeneration.buttons.newGeneration")}
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
                  {i18n.t("aiModules.imageGeneration.stats.totalGenerations")}
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

        {/* Total Imágenes */}
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <ImageIcon sx={{ fontSize: 20, color: 'success.500' }} />
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  {i18n.t("aiModules.imageGeneration.stats.imagesGenerated")}
                </Typography>
              </Box>
              {loading ? (
                <CircularProgress size="sm" />
              ) : (
                <Typography level="h3">
                  {formatNumber(stats.totalImages)}
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
                  {i18n.t("aiModules.imageGeneration.stats.last24Hours")}
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
          {i18n.t("aiModules.imageGeneration.history.title")}
        </Typography>
        <ImageGenerationHistory
          onRefresh={handleHistoryRefresh}
          refreshTrigger={refreshTrigger}
        />
      </Box>

      {/* Modal de Generación */}
      <ImageGenerationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleGenerationSuccess}
        currentBalance={creditsBalance}
      />
    </Box>
  );
}
