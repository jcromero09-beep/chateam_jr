/**
 * Página: AIMultimodal
 * Análisis Multimodal — visión y análisis de imágenes con IA
 * Módulo: ai_multimodal
 */

import { useState, useEffect, useCallback, useRef, useContext } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  CircularProgress,
  Alert,
  Textarea,
  IconButton,
  Chip,
  Divider,
  AspectRatio,
} from '@mui/joy';
import {
  ImageIcon,
  Upload,
  Scan,
  History,
  X,
  RefreshCw,
  Coins,
  Clock,
  Eye,
} from 'lucide-react';
import api from '../services/api';
import { AuthContext } from '../context/Auth/AuthContext';

// Logging solo en desarrollo
const isDev = import.meta.env.DEV;
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args); };
const devError = (...args: unknown[]) => { if (isDev) console.error(...args); };

interface CreditsBalance {
  balance: number;
  totalUsed?: number;
}

interface VisionAnalysis {
  id?: number | string;
  analysis: string;
  prompt?: string;
  imageUrl?: string;
  creditsUsed?: number;
  createdAt?: string;
  model?: string;
}

interface HistoryItem {
  id: number | string;
  analysis: string;
  prompt?: string;
  imageUrl?: string;
  creditsUsed?: number;
  createdAt: string;
  model?: string;
}

export default function AIMultimodal() {
  const authContext = useContext(AuthContext);
  const isSuperAdmin = authContext?.user?.super === true;

  // ─── Estado ──────────────────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<CreditsBalance | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(true);

  // Imagen y prompt
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<VisionAnalysis | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Historial
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // ─── Cargar créditos ─────────────────────────────────────────────────────
  const loadCredits = useCallback(async () => {
    try {
      setLoadingCredits(true);
      // Usar endpoint de token-info que devuelve el balance general de tokens de la compañía
      const res = await api.get('/ai/subplan-purchase/token-info');
      const raw = res.data as Record<string, unknown>;
      const tokenBalance = typeof raw.tokenBalance === 'number' ? raw.tokenBalance : 0;
      setCredits({ balance: tokenBalance, totalUsed: 0 });
    } catch (err: unknown) {
      devError('[AIMultimodal] Error cargando créditos:', err);
    } finally {
      setLoadingCredits(false);
    }
  }, []);

  // ─── Cargar historial ─────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      setHistoryError(null);
      const res = await api.get('/ai/vision/history');
      const data = res.data as unknown as { data?: HistoryItem[] } | HistoryItem[];
      const items = Array.isArray(data) ? data : ((data as { data?: HistoryItem[] }).data ?? []);
      setHistory(items);
      devLog('[AIMultimodal] Historial cargado:', items.length, 'items');
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string } } };
      // Si el endpoint no existe (404), mostrar estado vacío silenciosamente
      if (e.response?.status === 404 || e.response?.status === 405) {
        devLog('[AIMultimodal] Endpoint de historial no disponible, mostrando vacío.');
        setHistory([]);
      } else {
        setHistoryError('No se pudo cargar el historial.');
        devError('[AIMultimodal] Error cargando historial:', err);
      }
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    const [creditsPromise, historyPromise] = [loadCredits(), loadHistory()];
    Promise.allSettled([creditsPromise, historyPromise]).then((results) => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') devError(`[AIMultimodal] allSettled error [${i}]:`, r.reason);
      });
    });
  }, [loadCredits, loadHistory]);

  // ─── Handlers de imagen ──────────────────────────────────────────────────
  const handleImageSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Solo se aceptan archivos de imagen.');
      return;
    }
    setImageFile(file);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImageSelect(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageSelect(file);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── Analizar imagen ─────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!imageFile) return;
    try {
      setAnalyzing(true);
      setError(null);
      setResult(null);

      const formData = new FormData();
      formData.append('image', imageFile);
      if (prompt.trim()) formData.append('prompt', prompt.trim());

      const res = await api.post('/ai/vision/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data as unknown as { data?: VisionAnalysis } & VisionAnalysis;
      const analysis = data.data ?? data;
      setResult(analysis);
      devLog('[AIMultimodal] Análisis completado:', analysis);
      // Refrescar créditos e historial
      await Promise.allSettled([loadCredits(), loadHistory()]);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      setError(e.response?.data?.error ?? e.response?.data?.message ?? 'Error al analizar la imagen.');
      devError('[AIMultimodal] Error analizando:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  // ─── Formateo ────────────────────────────────────────────────────────────
  const formatDate = (iso?: string) => {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  };

  // Formateo básico tipo markdown (negritas, saltos de línea)
  const renderAnalysis = (text: string) => {
    return text.split('\n').map((line, i) => {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <Typography key={i} level="body-sm" sx={{ mb: line === '' ? 1 : 0 }}>
          {parts.map((part, j) =>
            j % 2 === 1 ? (
              <strong key={j}>{part}</strong>
            ) : (
              <span key={j}>{part}</span>
            )
          )}
        </Typography>
      );
    });
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
            <Eye size={28} color="var(--joy-palette-primary-500)" />
            Análisis Multimodal
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary', mt: 0.5 }}>
            Analiza imágenes y extrae información con visión artificial
          </Typography>
        </Box>

        <Card variant="soft" sx={{ minWidth: 180 }}>
          <CardContent sx={{ py: 1, px: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Coins size={16} />
              <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
                Créditos disponibles
              </Typography>
            </Box>
            {loadingCredits ? (
              <CircularProgress size="sm" sx={{ mt: 0.5 }} />
            ) : (
              <Typography level="h4" sx={{ color: 'primary.500' }}>
                {isSuperAdmin ? '∞ Ilimitado' : credits?.balance?.toLocaleString('es-ES') ?? '—'}
              </Typography>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Error global */}
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

      {/* ── Zona principal ─────────────────────────────────────────────────── */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Panel izquierdo: Upload + prompt */}
        <Grid xs={12} md={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography level="title-md" sx={{ mb: 2 }}>
                Imagen a analizar
              </Typography>

              {!imagePreview ? (
                <Box
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  sx={{
                    border: '2px dashed',
                    borderColor: isDragOver ? 'primary.500' : 'neutral.300',
                    borderRadius: 'lg',
                    p: 5,
                    textAlign: 'center',
                    cursor: 'pointer',
                    bgcolor: isDragOver ? 'primary.softBg' : 'background.level1',
                    transition: 'all 0.2s',
                    '&:hover': { borderColor: 'primary.400', bgcolor: 'primary.softBg' },
                  }}
                >
                  <ImageIcon size={40} color="var(--joy-palette-neutral-400)" />
                  <Typography level="body-sm" sx={{ mt: 1.5, color: 'text.secondary' }}>
                    Arrastra una imagen aquí
                  </Typography>
                  <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                    o haz clic para seleccionar (JPG, PNG, WebP, GIF)
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ position: 'relative' }}>
                  <AspectRatio ratio="16/9" sx={{ borderRadius: 'md', overflow: 'hidden' }}>
                    <img
                      src={imagePreview}
                      alt="Imagen seleccionada"
                      style={{ objectFit: 'contain', width: '100%', height: '100%' }}
                    />
                  </AspectRatio>
                  <IconButton
                    size="sm"
                    color="danger"
                    variant="solid"
                    onClick={clearImage}
                    sx={{ position: 'absolute', top: 8, right: 8 }}
                  >
                    <X size={14} />
                  </IconButton>
                  {imageFile && (
                    <Typography level="body-xs" sx={{ mt: 0.5, color: 'text.tertiary', textAlign: 'right' }}>
                      {imageFile.name}
                    </Typography>
                  )}
                </Box>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileInput}
              />

              <Box sx={{ mt: 2 }}>
                <Typography level="body-sm" sx={{ mb: 0.5, fontWeight: 'md' }}>
                  Instrucción / Pregunta (opcional)
                </Typography>
                <Textarea
                  placeholder="¿Qué quieres saber sobre esta imagen? Ej: Describe el contenido, identifica objetos, extrae texto..."
                  minRows={3}
                  maxRows={6}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </Box>

              <Button
                fullWidth
                sx={{ mt: 2 }}
                startDecorator={analyzing ? <CircularProgress size="sm" /> : <Scan size={16} />}
                disabled={!imageFile || analyzing}
                loading={analyzing}
                onClick={handleAnalyze}
              >
                Analizar imagen
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Panel derecho: Resultado */}
        <Grid xs={12} md={7}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography level="title-md" sx={{ mb: 2 }}>
                Resultado del análisis
              </Typography>

              {analyzing ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 8 }}>
                  <CircularProgress size="lg" />
                  <Typography level="body-sm" sx={{ mt: 2, color: 'text.secondary' }}>
                    Analizando imagen con IA...
                  </Typography>
                </Box>
              ) : !result ? (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    py: 8,
                    color: 'text.tertiary',
                  }}
                >
                  <Eye size={48} />
                  <Typography level="body-sm" sx={{ mt: 1.5 }}>
                    Sube una imagen y presiona "Analizar"
                  </Typography>
                </Box>
              ) : (
                <Box>
                  {result.prompt && (
                    <Box sx={{ mb: 2, p: 1.5, bgcolor: 'primary.softBg', borderRadius: 'sm' }}>
                      <Typography level="body-xs" sx={{ color: 'primary.700', fontStyle: 'italic' }}>
                        "{result.prompt}"
                      </Typography>
                    </Box>
                  )}
                  <Box
                    sx={{
                      p: 2,
                      bgcolor: 'background.level1',
                      borderRadius: 'md',
                      maxHeight: 400,
                      overflow: 'auto',
                    }}
                  >
                    {renderAnalysis(result.analysis)}
                  </Box>
                  <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {result.creditsUsed && (
                      <Chip size="sm" color="warning" variant="soft" startDecorator={<Coins size={12} />}>
                        {result.creditsUsed} créditos
                      </Chip>
                    )}
                    {result.model && (
                      <Chip size="sm" color="neutral" variant="soft">
                        {result.model}
                      </Chip>
                    )}
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ── Historial ──────────────────────────────────────────────────────── */}
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography level="title-md" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <History size={18} />
              Historial de análisis
            </Typography>
            <Button
              variant="outlined"
              size="sm"
              startDecorator={<RefreshCw size={14} />}
              onClick={loadHistory}
              loading={loadingHistory}
            >
              Actualizar
            </Button>
          </Box>

          {historyError && (
            <Alert color="warning" sx={{ mb: 2 }} size="sm">
              {historyError}
            </Alert>
          )}

          {loadingHistory ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size="md" />
            </Box>
          ) : history.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 5, color: 'text.tertiary' }}>
              <History size={36} />
              <Typography level="body-sm" sx={{ mt: 1 }}>
                No hay análisis recientes
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {history.map((item, idx) => (
                <Box key={item.id ?? idx}>
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 2,
                      p: 1.5,
                      bgcolor: 'background.level1',
                      borderRadius: 'sm',
                      alignItems: 'flex-start',
                    }}
                  >
                    {item.imageUrl && (
                      <Box
                        component="img"
                        src={item.imageUrl}
                        alt="Imagen analizada"
                        sx={{
                          width: 60,
                          height: 60,
                          objectFit: 'cover',
                          borderRadius: 'xs',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {item.prompt && (
                        <Typography level="body-xs" sx={{ color: 'primary.600', mb: 0.5, fontStyle: 'italic' }}>
                          "{item.prompt.substring(0, 80)}{item.prompt.length > 80 ? '...' : ''}"
                        </Typography>
                      )}
                      <Typography level="body-sm" sx={{ color: 'text.secondary' }} noWrap>
                        {item.analysis.substring(0, 120)}{item.analysis.length > 120 ? '...' : ''}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                        <Clock size={12} color="var(--joy-palette-text-tertiary)" />
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {formatDate(item.createdAt)}
                        </Typography>
                        {item.creditsUsed && (
                          <Chip size="sm" color="warning" variant="plain" sx={{ fontSize: '10px', py: 0 }}>
                            {item.creditsUsed} créditos
                          </Chip>
                        )}
                      </Box>
                    </Box>
                  </Box>
                  {idx < history.length - 1 && <Divider sx={{ mt: 1.5 }} />}
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
