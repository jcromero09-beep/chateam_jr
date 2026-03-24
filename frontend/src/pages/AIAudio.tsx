/**
 * Página: AIAudio
 * Audio IA — voz a texto y texto a voz
 * Módulo: ai_audio
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
  Select,
  Option,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Chip,
  IconButton,
  LinearProgress,
} from '@mui/joy';
import {
  Mic,
  Volume2,
  Upload,
  FileAudio,
  Coins,
  X,
  RefreshCw,
  Play,
  Download,
} from 'lucide-react';
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
      // Usar endpoint de token-info que devuelve el balance general de tokens de la compañía
      const res = await api.get('/ai/subplan-purchase/token-info');
      const raw = res.data as Record<string, unknown>;
      const tokenBalance = typeof raw.tokenBalance === 'number' ? raw.tokenBalance : 0;
      setCredits({ balance: tokenBalance, totalUsed: 0 });
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
            <Mic size={28} color="var(--joy-palette-primary-500)" />
            Audio IA
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary', mt: 0.5 }}>
            Convierte voz a texto y genera audio con inteligencia artificial
          </Typography>
        </Box>

        {/* Balance de créditos */}
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

      {/* Tabs */}
      <Tabs value={activeTab} onChange={(_, val) => setActiveTab(val as number)}>
        <TabList>
          <Tab>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Mic size={16} />
              Voz a Texto
            </Box>
          </Tab>
          <Tab>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Volume2 size={16} />
              Texto a Voz
            </Box>
          </Tab>
        </TabList>

        {/* ── TAB 1: Voz a Texto ──────────────────────────────────────── */}
        <TabPanel value={0} sx={{ px: 0, pt: 3 }}>
          <Grid container spacing={3}>
            <Grid xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography level="title-md" sx={{ mb: 2 }}>
                    Subir archivo de audio
                  </Typography>

                  {/* Zona de drop */}
                  <Box
                    ref={dropZoneRef}
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    sx={{
                      border: '2px dashed',
                      borderColor: isDragOver ? 'primary.500' : 'neutral.300',
                      borderRadius: 'md',
                      p: 4,
                      textAlign: 'center',
                      cursor: 'pointer',
                      bgcolor: isDragOver ? 'primary.softBg' : 'background.level1',
                      transition: 'all 0.2s',
                      '&:hover': {
                        borderColor: 'primary.400',
                        bgcolor: 'primary.softBg',
                      },
                    }}
                  >
                    <Upload size={32} color="var(--joy-palette-neutral-500)" />
                    <Typography level="body-sm" sx={{ mt: 1, color: 'text.secondary' }}>
                      Arrastra un archivo de audio aquí
                    </Typography>
                    <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                      o haz clic para seleccionar (MP3, WAV, M4A, OGG, etc.)
                    </Typography>
                  </Box>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                  />

                  {/* Archivo seleccionado */}
                  {audioFile && (
                    <Box
                      sx={{
                        mt: 2,
                        p: 1.5,
                        bgcolor: 'success.softBg',
                        borderRadius: 'sm',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                      }}
                    >
                      <FileAudio size={20} color="var(--joy-palette-success-600)" />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography level="body-sm" fontWeight="lg" noWrap>
                          {audioFile.name}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {formatFileSize(audioFile.size)}
                        </Typography>
                      </Box>
                      <IconButton
                        size="sm"
                        variant="plain"
                        color="neutral"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAudioFile(null);
                          setTranscription(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                      >
                        <X size={14} />
                      </IconButton>
                    </Box>
                  )}

                  {transcribing && (
                    <Box sx={{ mt: 2 }}>
                      <Typography level="body-xs" sx={{ color: 'text.secondary', mb: 0.5 }}>
                        Transcribiendo audio...
                      </Typography>
                      <LinearProgress />
                    </Box>
                  )}

                  <Button
                    fullWidth
                    sx={{ mt: 2 }}
                    startDecorator={transcribing ? <CircularProgress size="sm" /> : <Mic size={16} />}
                    disabled={!audioFile || transcribing}
                    loading={transcribing}
                    onClick={handleTranscribe}
                  >
                    Transcribir
                  </Button>
                </CardContent>
              </Card>
            </Grid>

            <Grid xs={12} md={6}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography level="title-md">Resultado</Typography>
                    {transcribeMeta && (
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        {transcribeMeta.language && (
                          <Chip size="sm" color="primary" variant="soft">
                            {transcribeMeta.language.toUpperCase()}
                          </Chip>
                        )}
                        {transcribeMeta.duration && (
                          <Chip size="sm" color="neutral" variant="soft">
                            {formatDuration(transcribeMeta.duration)}
                          </Chip>
                        )}
                      </Box>
                    )}
                  </Box>

                  {!transcription && !transcribing ? (
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        py: 6,
                        color: 'text.tertiary',
                      }}
                    >
                      <FileAudio size={40} />
                      <Typography level="body-sm" sx={{ mt: 1 }}>
                        La transcripción aparecerá aquí
                      </Typography>
                    </Box>
                  ) : (
                    <Box
                      sx={{
                        p: 2,
                        bgcolor: 'background.level1',
                        borderRadius: 'sm',
                        minHeight: 160,
                        fontSize: 'sm',
                        lineHeight: 1.7,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                      }}
                    >
                      {transcription}
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* ── TAB 2: Texto a Voz ──────────────────────────────────────── */}
        <TabPanel value={1} sx={{ px: 0, pt: 3 }}>
          <Grid container spacing={3}>
            <Grid xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography level="title-md" sx={{ mb: 2 }}>
                    Texto a convertir
                  </Typography>

                  <Textarea
                    placeholder="Escribe el texto que deseas convertir a audio..."
                    minRows={6}
                    maxRows={12}
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value)}
                    sx={{ mb: 2 }}
                  />

                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                    <Typography level="body-xs" sx={{ color: ttsText.length > 4000 ? 'danger.500' : 'text.tertiary' }}>
                      {ttsText.length} / 4000 caracteres
                    </Typography>
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography level="body-sm" sx={{ mb: 1, fontWeight: 'md' }}>
                      Voz
                    </Typography>
                    <Select
                      value={selectedVoice}
                      onChange={(_, val) => val && setSelectedVoice(val as VoiceOption)}
                    >
                      {VOICE_OPTIONS.map((v) => (
                        <Option key={v.value} value={v.value}>
                          <Box>
                            <Typography level="body-sm" fontWeight="md">
                              {v.label}
                            </Typography>
                            <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                              {v.description}
                            </Typography>
                          </Box>
                        </Option>
                      ))}
                    </Select>
                  </Box>

                  <Button
                    fullWidth
                    startDecorator={generating ? <CircularProgress size="sm" /> : <Volume2 size={16} />}
                    disabled={!ttsText.trim() || generating || ttsText.length > 4000}
                    loading={generating}
                    onClick={handleGenerateTTS}
                  >
                    Generar Audio
                  </Button>
                </CardContent>
              </Card>
            </Grid>

            <Grid xs={12} md={6}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography level="title-md" sx={{ mb: 2 }}>
                    Audio generado
                  </Typography>

                  {!audioResult && !generating ? (
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        py: 6,
                        color: 'text.tertiary',
                      }}
                    >
                      <Volume2 size={40} />
                      <Typography level="body-sm" sx={{ mt: 1 }}>
                        El audio generado aparecerá aquí
                      </Typography>
                    </Box>
                  ) : generating ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6 }}>
                      <CircularProgress size="lg" />
                      <Typography level="body-sm" sx={{ mt: 2, color: 'text.secondary' }}>
                        Generando audio...
                      </Typography>
                    </Box>
                  ) : audioResult ? (
                    <Box>
                      <Box
                        sx={{
                          p: 2,
                          bgcolor: 'background.level1',
                          borderRadius: 'sm',
                          mb: 2,
                        }}
                      >
                        <audio
                          controls
                          src={audioResult.audioUrl}
                          style={{ width: '100%' }}
                        />
                      </Box>

                      <Box sx={{ display: 'flex', gap: 1 }}>
                        {audioResult.duration && (
                          <Chip size="sm" color="neutral" variant="soft" startDecorator={<Play size={12} />}>
                            {formatDuration(audioResult.duration)}
                          </Chip>
                        )}
                        {audioResult.creditsUsed && (
                          <Chip size="sm" color="warning" variant="soft" startDecorator={<Coins size={12} />}>
                            {audioResult.creditsUsed} créditos
                          </Chip>
                        )}
                        <Chip size="sm" color="primary" variant="soft">
                          {VOICE_OPTIONS.find((v) => v.value === selectedVoice)?.label}
                        </Chip>
                      </Box>

                      <Button
                        variant="outlined"
                        size="sm"
                        startDecorator={<Download size={14} />}
                        component="a"
                        href={audioResult.audioUrl}
                        download="audio-generado.mp3"
                        sx={{ mt: 2 }}
                      >
                        Descargar MP3
                      </Button>
                    </Box>
                  ) : null}
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Voces disponibles */}
          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography level="title-sm" sx={{ mb: 2 }}>
                Voces disponibles
              </Typography>
              <Grid container spacing={1}>
                {VOICE_OPTIONS.map((v) => (
                  <Grid xs={12} sm={6} md={4} key={v.value}>
                    <Box
                      onClick={() => setSelectedVoice(v.value)}
                      sx={{
                        p: 1.5,
                        borderRadius: 'sm',
                        cursor: 'pointer',
                        border: '1px solid',
                        borderColor: selectedVoice === v.value ? 'primary.500' : 'neutral.200',
                        bgcolor: selectedVoice === v.value ? 'primary.softBg' : 'transparent',
                        '&:hover': { bgcolor: 'primary.softBg' },
                        transition: 'all 0.15s',
                      }}
                    >
                      <Typography level="body-sm" fontWeight="lg">
                        {v.label}
                      </Typography>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {v.description}
                      </Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </TabPanel>
      </Tabs>

      {/* Recargar créditos */}
      <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="plain"
          size="sm"
          startDecorator={<RefreshCw size={14} />}
          onClick={loadCredits}
          loading={loadingCredits}
        >
          Actualizar créditos
        </Button>
      </Box>
    </Box>
  );
}
