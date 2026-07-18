/**
 * Página: AIAudio
 * Audio IA — voz a texto y texto a voz
 * Módulo: ai_audio
 */

import { useState, useEffect, useCallback, useRef, useContext } from 'react';
// [conservado] Sin equivalente Radix: indicadores de progreso MUI Joy.
import { CircularProgress, LinearProgress } from '@mui/joy';
import {
  Microphone,
  SpeakerHigh,
  UploadSimple,
  FileAudio,
  Coins,
  X,
  ArrowClockwise,
  Play,
  DownloadSimple,
} from '@phosphor-icons/react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import api from '../services/api';
import { AuthContext } from '../context/Auth/AuthContext';

// Logging solo en desarrollo
const isDev = import.meta.env.DEV;
const devLog = (...args: unknown[]) => { if (isDev) console.log(...args); };
const devError = (...args: unknown[]) => { if (isDev) console.error(...args); };

// Tipos de voz disponibles
type VoiceOption = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

interface CreditsBalance {
  balance: number;
  totalUsed: number;
  plan?: string;
}

interface TranscribeResponse {
  transcription: string;
  duration?: number;
  language?: string;
}

interface TTSResponse {
  audioUrl: string;
  duration?: number;
  creditsUsed?: number;
}

const VOICE_OPTIONS: { value: VoiceOption; label: string; description: string }[] = [
  { value: 'alloy', label: 'Alloy', description: 'Equilibrada y neutra' },
  { value: 'echo', label: 'Echo', description: 'Masculina y expresiva' },
  { value: 'fable', label: 'Fable', description: 'Cálida y narrativa' },
  { value: 'onyx', label: 'Onyx', description: 'Profunda y autoritaria' },
  { value: 'nova', label: 'Nova', description: 'Femenina y enérgica' },
  { value: 'shimmer', label: 'Shimmer', description: 'Suave y clara' },
];

export default function AIAudio() {
  const authContext = useContext(AuthContext);
  const isSuperAdmin = authContext?.user?.super === true;

  // ─── Estado compartido ───────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<CreditsBalance | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(true);

  // ─── Estado Voz a Texto ──────────────────────────────────────────────────
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [transcribeMeta, setTranscribeMeta] = useState<{ duration?: number; language?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // ─── Estado Texto a Voz ──────────────────────────────────────────────────
  const [ttsText, setTtsText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>('alloy');
  const [generating, setGenerating] = useState(false);
  const [audioResult, setAudioResult] = useState<TTSResponse | null>(null);

  // ─── Cargar créditos ─────────────────────────────────────────────────────
  const loadCredits = useCallback(async () => {
    try {
      setLoadingCredits(true);
      // Endpoint UNIFICADO: balance real del sistema AICreditBalance.
      // AIAudio cobra principalmente "audio_minute" (STT) + "tts_character" (TTS).
      // Mostramos el balance combinado.
      const res = await api.get('/ai/credits/summary?keys=audio_minute,tts_character');
      const raw = res.data as {
        totalRemaining?: number;
        totalUsed?: number;
      };
      const remaining = Number(raw?.totalRemaining ?? 0);
      const used = Number(raw?.totalUsed ?? 0);
      setCredits({ balance: remaining, totalUsed: used });
    } catch (err: unknown) {
      devError('[AIAudio] Error cargando créditos:', err);
    } finally {
      setLoadingCredits(false);
    }
  }, []);

  useEffect(() => {
    loadCredits();
  }, [loadCredits]);

  // ─── Handlers Voz a Texto ─────────────────────────────────────────────────
  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      setAudioFile(file);
      setTranscription(null);
      setTranscribeMeta(null);
    } else {
      setError('Solo se aceptan archivos de audio.');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setTranscription(null);
      setTranscribeMeta(null);
    }
  };

  const handleTranscribe = async () => {
    if (!audioFile) return;
    try {
      setTranscribing(true);
      setError(null);
      setTranscription(null);

      const formData = new FormData();
      formData.append('file', audioFile);

      const res = await api.post<TranscribeResponse>('/ai/audio/transcribe', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = res.data as unknown as { data?: TranscribeResponse } & TranscribeResponse;
      const result = data.data ?? data;
      setTranscription(result.transcription);
      setTranscribeMeta({ duration: result.duration, language: result.language });
      devLog('[AIAudio] Transcripción completada:', result);
      loadCredits();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      setError(e.response?.data?.error ?? e.response?.data?.message ?? 'Error al transcribir el audio.');
      devError('[AIAudio] Error transcribiendo:', err);
    } finally {
      setTranscribing(false);
    }
  };

  // ─── Handlers Texto a Voz ─────────────────────────────────────────────────
  const handleGenerateTTS = async () => {
    if (!ttsText.trim()) return;
    try {
      setGenerating(true);
      setError(null);
      setAudioResult(null);

      const res = await api.post<TTSResponse>('/ai/audio/tts', {
        text: ttsText.trim(),
        voice: selectedVoice,
      });
      const data = res.data as unknown as { data?: TTSResponse } & TTSResponse;
      const result = data.data ?? data;
      setAudioResult(result);
      devLog('[AIAudio] Audio generado:', result);
      loadCredits();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      setError(e.response?.data?.error ?? e.response?.data?.message ?? 'Error al generar el audio.');
      devError('[AIAudio] Error generando TTS:', err);
    } finally {
      setGenerating(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-5 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
              <Microphone className="size-6" weight="fill" aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Audio IA
              </h1>
              <p className="text-sm text-muted-foreground">
                Convierte voz a texto y genera audio con inteligencia artificial
              </p>
            </div>
          </div>

          {/* Balance de créditos — REAL del sistema unificado (STT + TTS) */}
          <div className="min-w-[220px] rounded-lg border border-border bg-muted/40 px-4 py-2.5">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Coins className="size-4" aria-hidden />
              <span className="text-xs">Créditos disponibles (audio + TTS)</span>
            </div>
            {loadingCredits ? (
              <div className="mt-1">
                <CircularProgress size="sm" />
              </div>
            ) : (
              <div>
                <p className="text-2xl font-semibold text-primary">
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
              aria-label="Cerrar error"
              onClick={() => setError(null)}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-destructive-text transition-colors hover:bg-destructive/12"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* Tabs */}
        <Tabs
          value={activeTab === 0 ? 'stt' : 'tts'}
          onValueChange={(val) => setActiveTab(val === 'stt' ? 0 : 1)}
        >
          <TabsList>
            <TabsTrigger value="stt">
              <Microphone className="size-4" aria-hidden />
              Voz a Texto
            </TabsTrigger>
            <TabsTrigger value="tts">
              <SpeakerHigh className="size-4" aria-hidden />
              Texto a Voz
            </TabsTrigger>
          </TabsList>

          {/* ── TAB 1: Voz a Texto ──────────────────────────────────────── */}
          <TabsContent value="stt" className="pt-4">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
                <h2 className="mb-4 text-base font-semibold text-foreground">
                  Subir archivo de audio
                </h2>

                {/* Zona de drop */}
                <div
                  ref={dropZoneRef}
                  role="button"
                  tabIndex={0}
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleFileDrop}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  className={cn(
                    'cursor-pointer rounded-md border-2 border-dashed p-8 text-center transition-colors',
                    isDragOver
                      ? 'border-primary bg-primary/5'
                      : 'border-input bg-muted/40 hover:border-primary/60 hover:bg-primary/5',
                  )}
                >
                  <UploadSimple className="mx-auto size-8 text-muted-foreground" aria-hidden />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Arrastra un archivo de audio aquí
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    o haz clic para seleccionar (MP3, WAV, M4A, OGG, etc.)
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />

                {/* Archivo seleccionado */}
                {audioFile && (
                  <div className="mt-4 flex items-center gap-2 rounded-md bg-success/14 p-3">
                    <FileAudio className="size-5 shrink-0 text-success-text" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {audioFile.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(audioFile.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Quitar archivo"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAudioFile(null);
                        setTranscription(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                )}

                {transcribing && (
                  <div className="mt-4">
                    <p className="mb-1 text-xs text-muted-foreground">
                      Transcribiendo audio...
                    </p>
                    <LinearProgress />
                  </div>
                )}

                <Button
                  className="mt-4 w-full"
                  disabled={!audioFile || transcribing}
                  loading={transcribing}
                  onClick={handleTranscribe}
                >
                  {!transcribing && <Microphone className="size-4" aria-hidden />}
                  Transcribir
                </Button>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-foreground">Resultado</h2>
                  {transcribeMeta && (
                    <div className="flex gap-1.5">
                      {transcribeMeta.language && (
                        <Badge variant="primary">
                          {transcribeMeta.language.toUpperCase()}
                        </Badge>
                      )}
                      {transcribeMeta.duration && (
                        <Badge variant="neutral">
                          {formatDuration(transcribeMeta.duration)}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                {!transcription && !transcribing ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <FileAudio className="size-10" aria-hidden />
                    <p className="mt-2 text-sm">La transcripción aparecerá aquí</p>
                  </div>
                ) : (
                  <div className="min-h-40 whitespace-pre-wrap break-words rounded-md bg-muted/40 p-4 text-sm leading-relaxed text-foreground">
                    {transcription}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ── TAB 2: Texto a Voz ──────────────────────────────────────── */}
          <TabsContent value="tts" className="pt-4">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
                <h2 className="mb-4 text-base font-semibold text-foreground">
                  Texto a convertir
                </h2>

                <textarea
                  placeholder="Escribe el texto que deseas convertir a audio..."
                  rows={6}
                  aria-label="Texto a convertir"
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                  className="w-full resize-y rounded-md border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground hover:border-muted-foreground/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />

                <div className="mb-4 mt-2 flex justify-end">
                  <span
                    className={cn(
                      'text-xs',
                      ttsText.length > 4000 ? 'text-destructive-text' : 'text-muted-foreground',
                    )}
                  >
                    {ttsText.length} / 4000 caracteres
                  </span>
                </div>

                <div className="mb-4 space-y-1.5">
                  <Label htmlFor="tts-voice">Voz</Label>
                  <Select
                    value={selectedVoice}
                    onValueChange={(val) => setSelectedVoice(val as VoiceOption)}
                  >
                    <SelectTrigger id="tts-voice" aria-label="Seleccionar voz">
                      <SelectValue placeholder="Selecciona una voz" />
                    </SelectTrigger>
                    <SelectContent>
                      {VOICE_OPTIONS.map((v) => (
                        <SelectItem key={v.value} value={v.value}>
                          <span className="block text-sm font-medium text-foreground">
                            {v.label}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {v.description}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full"
                  disabled={!ttsText.trim() || generating || ttsText.length > 4000}
                  loading={generating}
                  onClick={handleGenerateTTS}
                >
                  {!generating && <SpeakerHigh className="size-4" aria-hidden />}
                  Generar Audio
                </Button>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
                <h2 className="mb-4 text-base font-semibold text-foreground">
                  Audio generado
                </h2>

                {!audioResult && !generating ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <SpeakerHigh className="size-10" aria-hidden />
                    <p className="mt-2 text-sm">El audio generado aparecerá aquí</p>
                  </div>
                ) : generating ? (
                  <div className="flex flex-col items-center py-12">
                    <CircularProgress size="lg" />
                    <p className="mt-4 text-sm text-muted-foreground">Generando audio...</p>
                  </div>
                ) : audioResult ? (
                  <div>
                    <div className="mb-4 rounded-md bg-muted/40 p-4">
                      <audio
                        controls
                        src={audioResult.audioUrl}
                        className="w-full"
                      />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {audioResult.duration && (
                        <Badge variant="neutral">
                          <Play className="size-3" aria-hidden />
                          {formatDuration(audioResult.duration)}
                        </Badge>
                      )}
                      {audioResult.creditsUsed && (
                        <Badge variant="warning">
                          <Coins className="size-3" aria-hidden />
                          {audioResult.creditsUsed} créditos
                        </Badge>
                      )}
                      <Badge variant="primary">
                        {VOICE_OPTIONS.find((v) => v.value === selectedVoice)?.label}
                      </Badge>
                    </div>

                    <a
                      href={audioResult.audioUrl}
                      download="audio-generado.mp3"
                      className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-4')}
                    >
                      <DownloadSimple className="size-4" aria-hidden />
                      Descargar MP3
                    </a>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Voces disponibles */}
            <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm shadow-black/[0.02]">
              <h3 className="mb-4 text-sm font-semibold text-foreground">
                Voces disponibles
              </h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                {VOICE_OPTIONS.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    aria-pressed={selectedVoice === v.value}
                    onClick={() => setSelectedVoice(v.value)}
                    className={cn(
                      'rounded-md border p-3 text-left transition-colors',
                      selectedVoice === v.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-accent/40',
                    )}
                  >
                    <span className="block text-sm font-semibold text-foreground">
                      {v.label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {v.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Recargar créditos */}
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            loading={loadingCredits}
            onClick={loadCredits}
          >
            {!loadingCredits && <ArrowClockwise className="size-4" aria-hidden />}
            Actualizar créditos
          </Button>
        </div>
      </div>
    </div>
  );
}
