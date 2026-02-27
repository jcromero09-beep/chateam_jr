/**
 * Componente: ImageGenerationModal
 * Modal para generar nuevas imágenes con IA (DALL-E)
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
  Slider,
  Alert,
  Grid,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider
} from '@mui/joy';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ImageIcon from '@mui/icons-material/Image';
import AspectRatioIcon from '@mui/icons-material/AspectRatio';
import StyleIcon from '@mui/icons-material/Style';
import WarningIcon from '@mui/icons-material/Warning';
import { toast } from 'react-toastify';
import aiImageGenerationApi, { PricingResponse } from '../services/aiImageGenerationApi';

interface ImageGenerationModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentBalance: number;
}

interface FormData {
  prompt: string;
  imageSize: '1024x1024' | '512x512' | '256x256';
  numberOfImages: number;
  stylePreset: string;
  model: string;
}

const INITIAL_FORM_DATA: FormData = {
  prompt: '',
  imageSize: '1024x1024',
  numberOfImages: 1,
  stylePreset: '',
  model: 'dall-e-3'
};

// Labels para tamaños
const SIZE_LABELS: Record<string, string> = {
  '1024x1024': '1024x1024 (Alta Calidad)',
  '512x512': '512x512 (Calidad Media)',
  '256x256': '256x256 (Baja Calidad)'
};

// Labels para estilos
const STYLE_LABELS: Record<string, string> = {
  '': 'Sin estilo específico',
  'realistic': 'Realista',
  'cartoon': 'Caricatura',
  'anime': 'Anime',
  'abstract': 'Abstracto',
  'photographic': 'Fotográfico',
  'digital-art': 'Arte Digital',
  'comic-book': 'Comic',
  'fantasy-art': 'Fantasía',
  'line-art': 'Líneas',
  'analog-film': 'Film Analógico',
  'neon-punk': 'Neon Punk',
  'isometric': 'Isométrico',
  'low-poly': 'Low Poly',
  'origami': 'Origami',
  'cinematic': 'Cinemático',
  '3d-model': 'Modelo 3D',
  'pixel-art': 'Pixel Art'
};

export default function ImageGenerationModal({
  open,
  onClose,
  onSuccess,
  currentBalance
}: ImageGenerationModalProps) {
  // P3.44: Helper para logging solo en desarrollo
  const isDev = import.meta.env.DEV;
  const devError = (...args: any[]) => {
    if (isDev) console.error(...args);
  };

  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);
  const [loading, setLoading] = useState(false);
  const [loadingPricing, setLoadingPricing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [estimatedCost, setEstimatedCost] = useState(0);

  // Cargar precios al abrir el modal
  const loadPricing = useCallback(async () => {
    try {
      setLoadingPricing(true);
      const response = await aiImageGenerationApi.getPricing();
      setPricing(response);
    } catch (err: any) {
      devError('Error al cargar precios:', err);
      // Usar precios por defecto si falla la carga
      setPricing({
        pricing: { '1024x1024': 30, '512x512': 20, '256x256': 10 },
        config: {
          minImages: 1,
          maxImages: 10,
          supportedSizes: ['1024x1024', '512x512', '256x256'],
          supportedModels: ['dall-e-2', 'dall-e-3'],
          stylePresets: Object.keys(STYLE_LABELS).filter(k => k !== ''),
          defaultModel: 'dall-e-3'
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
      const cost = aiImageGenerationApi.calculateEstimatedCost(
        formData.imageSize,
        formData.numberOfImages,
        pricing.pricing
      );
      setEstimatedCost(cost);
    }
  }, [formData.imageSize, formData.numberOfImages, pricing]);

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
        imageSize: formData.imageSize,
        numberOfImages: formData.numberOfImages,
        ...(formData.stylePreset && { stylePreset: formData.stylePreset }),
        ...(formData.model && { model: formData.model })
      };

      await aiImageGenerationApi.generateImages(params);

      toast.success(`Generación iniciada: ${formData.numberOfImages} imagen(es)`);
      onSuccess();
      onClose();
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message || 'Error al generar imágenes';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Verificar si puede generar
  const canGenerate = formData.prompt.trim().length >= 2 &&
    estimatedCost <= currentBalance &&
    !loading;

  const insufficientCredits = estimatedCost > currentBalance;

  return (
    <Modal open={open} onClose={onClose}>
      <ModalDialog sx={{ minWidth: { xs: '95vw', sm: 600 }, maxWidth: 700 }}>
        <ModalClose />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <AutoAwesomeIcon sx={{ color: 'primary.500' }} />
          <Typography level="h4">Generar Imágenes con IA</Typography>
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
              Describe tu imagen *
            </Typography>
            <Textarea
              placeholder="Ej: Un gato astronauta flotando en el espacio con la Tierra de fondo, estilo realista, iluminación cinematográfica..."
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
            {/* Tamaño de imagen */}
            <Grid xs={12} sm={6}>
              <Typography level="body-sm" sx={{ mb: 1, fontWeight: 'medium' }}>
                <AspectRatioIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                Tamaño
              </Typography>
              <Select
                value={formData.imageSize}
                onChange={(_, val) => val && setFormData({ ...formData, imageSize: val as any })}
                disabled={loading || loadingPricing}
              >
                {(pricing?.config.supportedSizes || ['1024x1024', '512x512', '256x256']).map(size => (
                  <Option key={size} value={size}>
                    {SIZE_LABELS[size] || size} ({pricing?.pricing[size] || 0} créditos)
                  </Option>
                ))}
              </Select>
            </Grid>

            {/* Modelo */}
            <Grid xs={12} sm={6}>
              <Typography level="body-sm" sx={{ mb: 1, fontWeight: 'medium' }}>
                <ImageIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                Modelo
              </Typography>
              <Select
                value={formData.model}
                onChange={(_, val) => val && setFormData({ ...formData, model: val })}
                disabled={loading || loadingPricing}
              >
                {(pricing?.config.supportedModels || ['dall-e-3', 'dall-e-2']).map(model => (
                  <Option key={model} value={model}>
                    {model === 'dall-e-3' ? 'DALL-E 3 (Recomendado)' : 'DALL-E 2'}
                  </Option>
                ))}
              </Select>
            </Grid>

            {/* Estilo */}
            <Grid xs={12}>
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

            {/* Número de imágenes */}
            <Grid xs={12}>
              <Typography level="body-sm" sx={{ mb: 1, fontWeight: 'medium' }}>
                Número de imágenes: {formData.numberOfImages}
              </Typography>
              <Slider
                value={formData.numberOfImages}
                onChange={(_, val) => setFormData({ ...formData, numberOfImages: val as number })}
                min={pricing?.config.minImages || 1}
                max={pricing?.config.maxImages || 10}
                step={1}
                marks
                valueLabelDisplay="auto"
                disabled={loading || loadingPricing}
              />
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
                  {formData.numberOfImages} imagen{formData.numberOfImages > 1 ? 'es' : ''}
                </Chip>
                <Chip size="sm" variant="outlined">
                  {formData.imageSize}
                </Chip>
                {formData.stylePreset && (
                  <Chip size="sm" variant="outlined">
                    {STYLE_LABELS[formData.stylePreset] || formData.stylePreset}
                  </Chip>
                )}
                <Chip size="sm" variant="outlined">
                  {formData.model}
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
              startDecorator={!loading && <AutoAwesomeIcon />}
            >
              {loading ? 'Generando...' : 'Generar Imágenes'}
            </Button>
          </Box>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
