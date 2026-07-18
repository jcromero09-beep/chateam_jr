/**
 * Componente: VideoGenerationModal
 * Modal para generar nuevos videos con IA (Sora)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  ModalDialog,
  ModalClose,
  Typography,
  Box,
  Button,
  Textarea,
  Select,
  Option,
  Alert,
  Grid,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider
} from '@mui/joy';
import VideocamIcon from '@mui/icons-material/Videocam';
import AspectRatioIcon from '@mui/icons-material/AspectRatio';
import StyleIcon from '@mui/icons-material/Style';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import WarningIcon from '@mui/icons-material/Warning';
import { toast } from 'react-toastify';
import aiVideoGenerationApi, { VideoPricingResponse } from '../services/aiVideoGenerationApi';

interface VideoGenerationModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentBalance: number;
}

interface FormData {
  prompt: string;
  videoSize: string;
  duration: string;
  stylePreset: string;
  model: 'sora-2' | 'sora-2-pro';
}

const INITIAL_FORM_DATA: FormData = {
  prompt: '',
  videoSize: '1280x720',
  duration: '4',
  stylePreset: '',
  model: 'sora-2'
};

// Tamaños disponibles por modelo
const VIDEO_SIZES_BY_MODEL: Record<string, string[]> = {
  'sora-2': ['1280x720', '720x1280'],
  'sora-2-pro': ['1792x1024', '1024x1792', '1280x720']
};

// Duraciones disponibles por modelo
const DURATIONS_BY_MODEL: Record<string, string[]> = {
  'sora-2': ['4', '8', '12'],
  'sora-2-pro': ['10', '15', '25']
};

// Labels para tamaños
const SIZE_LABELS: Record<string, string> = {
  '1280x720': 'Horizontal 720p (1280x720)',
  '720x1280': 'Vertical 720p (720x1280)',
  '1792x1024': 'Horizontal 1024p (1792x1024)',
  '1024x1792': 'Vertical 1024p (1024x1792)'
};

// Labels para duraciones
const DURATION_LABELS: Record<string, string> = {
  '4': '4 segundos',
  '8': '8 segundos',
  '10': '10 segundos',
  '12': '12 segundos',
  '15': '15 segundos',
  '25': '25 segundos'
};

// Labels para estilos
const STYLE_LABELS: Record<string, string> = {
  '': 'Sin estilo específico',
  'cinematic': 'Cinemático',
  'realistic': 'Realista',
  'anime': 'Anime',
  'cartoon': 'Caricatura',
  'abstract': 'Abstracto',
  'slow-motion': 'Cámara Lenta',
  'timelapse': 'Timelapse',
  'drone-shot': 'Toma Aérea',
  'documentary': 'Documental',
  'music-video': 'Video Musical'
};

export default function VideoGenerationModal({
  open,
  onClose,
  onSuccess,
  currentBalance
}: VideoGenerationModalProps) {
  // Helper para logging solo en desarrollo
  const isDev = import.meta.env.DEV;
  const devError = (...args: any[]) => {
    if (isDev) console.error(...args);
  };

  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [loading, setLoading] = useState(false);
  const [loadingPricing, setLoadingPricing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pricing, setPricing] = useState<VideoPricingResponse | null>(null);
  const [estimatedCost, setEstimatedCost] = useState(0);

  // Cargar precios al abrir el modal
  const loadPricing = useCallback(async () => {
    try {
      setLoadingPricing(true);
      const response = await aiVideoGenerationApi.getPricing();
      setPricing(response);
    } catch (err: any) {
      devError('Error al cargar precios:', err);
      // Usar precios por defecto si falla la carga
      setPricing({
        pricing: {
          '1280x720_4s': 100,
          '1280x720_8s': 200,
          '1280x720_12s': 300,
          '720x1280_4s': 100,
          '720x1280_8s': 200,
          '720x1280_12s': 300,
          '1792x1024_10s': 400,
          '1792x1024_15s': 600,
          '1792x1024_25s': 1000,
          '1024x1792_10s': 400,
          '1024x1792_15s': 600,
          '1024x1792_25s': 1000,
          '1280x720_10s': 300,
          '1280x720_15s': 450,
          '1280x720_25s': 750
        },
        config: {
          supportedModels: ['sora-2', 'sora-2-pro'],
          defaultModel: 'sora-2',
          supportedSizesSora2: ['1280x720', '720x1280'],
          supportedSizesSora2Pro: ['1792x1024', '1024x1792', '1280x720'],
          supportedDurationsSora2: [4, 8, 12],
          supportedDurationsSora2Pro: [10, 15, 25],
          stylePresets: Object.keys(STYLE_LABELS).filter(k => k !== '')
        }
      });
    } finally {
      setLoadingPricing(false);
    }
  }, []);

  // Reset form cuando se abre el modal
  useEffect(() => {
    if (open) {
      setFormData(INITIAL_FORM_DATA);
      setError(null);
      loadPricing();
    }
  }, [open, loadPricing]);

  // Calcular costo estimado cuando cambia el form
  useEffect(() => {
    if (pricing) {
      const cost = aiVideoGenerationApi.calculateEstimatedCost(
        formData.videoSize,
        parseInt(formData.duration, 10),
        pricing.pricing
      );
      setEstimatedCost(cost);
    }
  }, [formData.videoSize, formData.duration, pricing]);

  // Manejar cambio de modelo
  const handleModelChange = (newModel: string) => {
    const availableSizes = VIDEO_SIZES_BY_MODEL[newModel] || [];
    const availableDurations = DURATIONS_BY_MODEL[newModel] || [];

    setFormData({
      ...formData,
      model: newModel as 'sora-2' | 'sora-2-pro',
      videoSize: availableSizes[0] || '1280x720',
      duration: availableDurations[0] || '4'
    });
  };

  // Manejar envío del formulario
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validar prompt
    if (!formData.prompt.trim()) {
      setError('El prompt es requerido');
      setLoading(false);
      return;
    }

    if (formData.prompt.trim().length < 10) {
      setError('El prompt debe tener al menos 10 caracteres');
      setLoading(false);
      return;
    }

    if (formData.prompt.trim().length > 1000) {
      setError('El prompt no puede exceder 1000 caracteres');
      setLoading(false);
      return;
    }

    // Validar créditos
    if (estimatedCost > currentBalance) {
      setError(`Créditos insuficientes. Necesitas ${estimatedCost} créditos pero solo tienes ${currentBalance}.`);
      setLoading(false);
      return;
    }

    try {
      const params = {
        prompt: formData.prompt.trim(),
        videoSize: formData.videoSize,
        duration: parseInt(formData.duration, 10),
        ...(formData.stylePreset && { stylePreset: formData.stylePreset }),
        ...(formData.model && { model: formData.model })
      };

      await aiVideoGenerationApi.generateVideo(params);

      toast.success('Video enviado a generación. Recibirás una notificación cuando esté listo.');
      onSuccess();
      onClose();
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Error al generar video';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Verificar si puede generar
  const canGenerate = formData.prompt.trim().length >= 10 &&
    estimatedCost <= currentBalance &&
    !loading;

  const insufficientCredits = estimatedCost > currentBalance;

  // Obtener tamaños y duraciones disponibles según el modelo seleccionado
  const availableSizes = VIDEO_SIZES_BY_MODEL[formData.model] || [];
  const availableDurations = DURATIONS_BY_MODEL[formData.model] || [];

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ minWidth: { xs: '95vw', sm: 600 }, maxWidth: 700 }}>
        <ModalClose />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <VideocamIcon sx={{ color: 'primary.500' }} />
          <Typography level="h4">Generar Video con IA</Typography>
        </Box>

        <Box component="form" onSubmit={handleSubmit}>
          {error && (
            <Alert color="danger" sx={{ mb: 2 }} startDecorator={<WarningIcon />}>
              {error}
            </Alert>
          )}

          {/* Prompt */}
          <Box sx={{ mb: 3 }}>
            <Typography level="body-sm" sx={{ mb: 1, fontWeight: 'medium' }}>
              Describe tu video *
            </Typography>
            <Textarea
              placeholder="Ej: Un águila volando sobre un cañón al amanecer, cámara lenta, iluminación cinematográfica..."
              minRows={3}
              maxRows={6}
              value={formData.prompt}
              onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
              disabled={loading}
              sx={{ width: '100%' }}
            />
            <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary' }}>
              {formData.prompt.length}/1000 caracteres
            </Typography>
          </Box>

          <Grid container spacing={2}>
            {/* Modelo */}
            <Grid xs={12} sm={6}>
              <Typography level="body-sm" sx={{ mb: 1, fontWeight: 'medium' }}>
                <VideocamIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                Modelo
              </Typography>
              <Select
                value={formData.model}
                onChange={(_, val) => val && handleModelChange(val)}
                disabled={loading || loadingPricing}
              >
                <Option value="sora-2">Sora 2 (Rápido)</Option>
                <Option value="sora-2-pro">Sora 2 Pro (Alta Calidad)</Option>
              </Select>
            </Grid>

            {/* Tamaño de video */}
            <Grid xs={12} sm={6}>
              <Typography level="body-sm" sx={{ mb: 1, fontWeight: 'medium' }}>
                <AspectRatioIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                Tamaño
              </Typography>
              <Select
                value={formData.videoSize}
                onChange={(_, val) => val && setFormData({ ...formData, videoSize: val })}
                disabled={loading || loadingPricing}
              >
                {availableSizes.map(size => (
                  <Option key={size} value={size}>
                    {SIZE_LABELS[size] || size}
                  </Option>
                ))}
              </Select>
            </Grid>

            {/* Duración */}
            <Grid xs={12} sm={6}>
              <Typography level="body-sm" sx={{ mb: 1, fontWeight: 'medium' }}>
                <AccessTimeIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                Duración
              </Typography>
              <Select
                value={formData.duration}
                onChange={(_, val) => val && setFormData({ ...formData, duration: val })}
                disabled={loading || loadingPricing}
              >
                {availableDurations.map(duration => (
                  <Option key={duration} value={duration}>
                    {DURATION_LABELS[duration] || `${duration}s`}
                  </Option>
                ))}
              </Select>
            </Grid>

            {/* Estilo */}
            <Grid xs={12} sm={6}>
              <Typography level="body-sm" sx={{ mb: 1, fontWeight: 'medium' }}>
                <StyleIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                Estilo (Opcional)
              </Typography>
              <Select
                value={formData.stylePreset}
                onChange={(_, val) => setFormData({ ...formData, stylePreset: val || '' })}
                disabled={loading || loadingPricing}
              >
                <Option value="">Sin estilo específico</Option>
                {(pricing?.config.stylePresets || []).map(style => (
                  <Option key={style} value={style}>
                    {STYLE_LABELS[style] || style}
                  </Option>
                ))}
              </Select>
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          {/* Resumen de costo */}
          <Card
            variant="soft"
            color={insufficientCredits ? 'danger' : 'primary'}
            sx={{ mb: 3 }}
          >
            <CardContent>
              <Grid container spacing={2} alignItems="center">
                <Grid xs={6}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Costo estimado
                  </Typography>
                  <Typography level="h3">
                    {loadingPricing ? <CircularProgress size="sm" /> : `${estimatedCost} créditos`}
                  </Typography>
                </Grid>
                <Grid xs={6} sx={{ textAlign: 'right' }}>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Tu balance
                  </Typography>
                  <Typography
                    level="h4"
                    sx={{ color: insufficientCredits ? 'danger.500' : 'success.500' }}
                  >
                    {currentBalance} créditos
                  </Typography>
                </Grid>
              </Grid>

              {insufficientCredits && (
                <Alert color="danger" size="sm" sx={{ mt: 2 }}>
                  Créditos insuficientes. Necesitas {estimatedCost - currentBalance} créditos más.
                </Alert>
              )}

              <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip size="sm" variant="outlined">
                  {formData.videoSize}
                </Chip>
                <Chip size="sm" variant="outlined">
                  {DURATION_LABELS[formData.duration] || `${formData.duration}s`}
                </Chip>
                {formData.stylePreset && (
                  <Chip size="sm" variant="outlined">
                    {STYLE_LABELS[formData.stylePreset] || formData.stylePreset}
                  </Chip>
                )}
                <Chip size="sm" variant="outlined">
                  {formData.model === 'sora-2' ? 'Sora 2' : 'Sora 2 Pro'}
                </Chip>
              </Box>
            </CardContent>
          </Card>

          {/* Botones */}
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              color="neutral"
              onClick={onClose}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={loading}
              disabled={!canGenerate}
              startDecorator={!loading && <VideocamIcon />}
            >
              {loading ? 'Enviando...' : 'Generar Video'}
            </Button>
          </Box>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
