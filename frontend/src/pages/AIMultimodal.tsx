/**
 * Página: AIMultimodal
 * Análisis Multimodal — visión y análisis de imágenes con IA
 * Módulo: ai_multimodal
 */

import { useState, useEffect, useCallback, useRef, useContext } from 'react';
// [migración] CircularProgress se conserva como MUI (no hay equivalente en el design system).
import { CircularProgress } from '@mui/joy';
import {
  ImageSquare,
  Scan,
  ClockCounterClockwise,
  X,
  ArrowClockwise,
  Coins,
  Clock,
  Eye,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
      // Endpoint UNIFICADO: balance real del sistema AICreditBalance.
      // AIMultimodal cobra principalmente "vision_analysis" + "pdf_processing".
      // Mostramos el balance combinado de ambos.
      const res = await api.get('/ai/credits/summary?keys=vision_analysis,pdf_processing');
      const raw = res.data as {
        byKey?: Record<string, { remaining?: number; usedCredits?: number }>;
        totalRemaining?: number;
        totalUsed?: number;
      };
      const remaining = Number(raw?.totalRemaining ?? 0);
      const used = Number(raw?.totalUsed ?? 0);
      setCredits({ balance: remaining, totalUsed: used });
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
        <p key={i} className={line === '' ? 'mb-2 text-sm text-foreground' : 'text-sm text-foreground'}>
          {parts.map((part, j) =>
            j % 2 === 1 ? (
              <strong key={j}>{part}</strong>
            ) : (
              <span key={j}>{part}</span>
            )
          )}
        </p>
      );
    });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Eye className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Análisis Multimodal
              </h1>
              <p className="text-sm text-muted-foreground">
                Analiza imágenes y extrae información con visión artificial
              </p>
            </div>
          </div>

          {/* Créditos disponibles */}
          <div className="min-w-[220px] rounded-lg border border-border bg-muted/40 px-4 py-3">
            <div className="flex items-center gap-1.5">
              <Coins className="size-4 text-muted-foreground" aria-hidden />
              <span className="text-xs text-muted-foreground">
                Créditos disponibles (visión + PDF)
              </span>
            </div>
            {loadingCredits ? (
              <CircularProgress size="sm" sx={{ mt: 0.5 }} />
            ) : (
              <div className="mt-0.5">
                <p className="text-xl font-semibold text-primary">
                  {isSuperAdmin ? '∞ Ilimitado' : credits?.balance?.toLocaleString('es-ES') ?? '—'}
                </p>
                {!isSuperAdmin && (credits?.totalUsed ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Usados: {credits?.totalUsed?.toLocaleString('es-ES')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Error global */}
        {error && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/12 px-4 py-3 text-sm text-destructive-text"
          >
            <span>{error}</span>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => setError(null)}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-destructive-text transition-colors hover:bg-destructive/12"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* ── Zona principal ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* Panel izquierdo: Upload + prompt */}
          <div className="md:col-span-5">
            <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-4 text-base font-semibold text-foreground">
                Imagen a analizar
              </h2>

              {!imagePreview ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={
                    'cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors ' +
                    (isDragOver
                      ? 'border-primary bg-accent/60'
                      : 'border-input bg-muted/40 hover:border-primary/60 hover:bg-accent/40')
                  }
                >
                  <ImageSquare className="mx-auto size-10 text-muted-foreground" aria-hidden />
                  <p className="mt-3 text-sm text-muted-foreground">
                    Arrastra una imagen aquí
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    o haz clic para seleccionar (JPG, PNG, WebP, GIF)
                  </p>
                </div>
              ) : (
                <div className="relative">
                  <div className="aspect-video overflow-hidden rounded-md bg-muted/40">
                    <img
                      src={imagePreview}
                      alt="Imagen seleccionada"
                      width={640}
                      height={360}
                      className="size-full object-contain"
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Quitar imagen"
                    onClick={clearImage}
                    className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-md bg-destructive text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                  {imageFile && (
                    <p className="mt-1 text-right text-xs text-muted-foreground">
                      {imageFile.name}
                    </p>
                  )}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileInput}
              />

              <div className="mt-4">
                <label
                  htmlFor="ai-multimodal-prompt"
                  className="mb-1.5 block text-sm font-medium text-foreground"
                >
                  Instrucción / Pregunta (opcional)
                </label>
                <textarea
                  id="ai-multimodal-prompt"
                  placeholder="¿Qué quieres saber sobre esta imagen? Ej: Describe el contenido, identifica objetos, extrae texto..."
                  rows={3}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[80px] w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
              </div>

              <Button
                className="mt-4 w-full"
                disabled={!imageFile || analyzing}
                loading={analyzing}
                onClick={handleAnalyze}
              >
                {!analyzing && <Scan className="size-4" aria-hidden />}
                Analizar imagen
              </Button>
            </div>
          </div>

          {/* Panel derecho: Resultado */}
          <div className="md:col-span-7">
            <div className="flex h-full flex-col rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <h2 className="mb-4 text-base font-semibold text-foreground">
                Resultado del análisis
              </h2>

              {analyzing ? (
                <div className="flex flex-col items-center py-16">
                  <CircularProgress size="lg" />
                  <p className="mt-4 text-sm text-muted-foreground">
                    Analizando imagen con IA...
                  </p>
                </div>
              ) : !result ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Eye className="size-12" aria-hidden />
                  <p className="mt-3 text-sm">
                    Sube una imagen y presiona "Analizar"
                  </p>
                </div>
              ) : (
                <div>
                  {result.prompt && (
                    <div className="mb-4 rounded-md bg-accent/60 p-3">
                      <p className="text-xs italic text-accent-foreground">
                        "{result.prompt}"
                      </p>
                    </div>
                  )}
                  <div className="max-h-[400px] space-y-1 overflow-auto rounded-md bg-muted/40 p-4">
                    {renderAnalysis(result.analysis)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {result.creditsUsed && (
                      <Badge variant="warning">
                        <Coins className="size-3" aria-hidden />
                        {result.creditsUsed} créditos
                      </Badge>
                    )}
                    {result.model && (
                      <Badge variant="neutral">{result.model}</Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Historial ──────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <ClockCounterClockwise className="size-5" aria-hidden />
              Historial de análisis
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={loadHistory}
              loading={loadingHistory}
            >
              {!loadingHistory && <ArrowClockwise className="size-3.5" aria-hidden />}
              Actualizar
            </Button>
          </div>

          {historyError && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-warning/30 bg-warning/16 px-4 py-2.5 text-sm text-warning-text"
            >
              {historyError}
            </div>
          )}

          {loadingHistory ? (
            <div className="flex justify-center py-8">
              <CircularProgress size="md" />
            </div>
          ) : history.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              <ClockCounterClockwise className="mx-auto size-9" aria-hidden />
              <p className="mt-2 text-sm">
                No hay análisis recientes
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {history.map((item, idx) => (
                <div
                  key={item.id ?? idx}
                  className="flex items-start gap-3 rounded-md py-3 first:pt-0 last:pb-0"
                >
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt="Imagen analizada"
                      width={60}
                      height={60}
                      className="size-[60px] shrink-0 rounded-sm object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    {item.prompt && (
                      <p className="mb-0.5 truncate text-xs italic text-primary">
                        "{item.prompt.substring(0, 80)}{item.prompt.length > 80 ? '...' : ''}"
                      </p>
                    )}
                    <p className="truncate text-sm text-muted-foreground">
                      {item.analysis.substring(0, 120)}{item.analysis.length > 120 ? '...' : ''}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <Clock className="size-3 text-muted-foreground" aria-hidden />
                      <span className="text-xs text-muted-foreground">
                        {formatDate(item.createdAt)}
                      </span>
                      {item.creditsUsed && (
                        <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                          {item.creditsUsed} créditos
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
