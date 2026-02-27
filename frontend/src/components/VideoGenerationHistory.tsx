/**
 * Componente: VideoGenerationHistory
 * Lista el historial de generaciones de videos con filtros y paginación
 */

import { useEffect, useCallback, useReducer } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  Sheet,
  Input,
  Select,
  Option,
  Button,
  IconButton,
  Chip,
  Grid,
  Modal,
  ModalDialog,
  ModalClose,
  CircularProgress,
  Alert,
  Tooltip
} from '@mui/joy';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import VideocamIcon from '@mui/icons-material/Videocam';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { toast } from 'react-toastify';
import aiVideoGenerationApi, {
  VideoGeneration,
  VideoGenerationItem,
  PaginationInfo
} from '../services/aiVideoGenerationApi';

interface VideoGenerationHistoryProps {
  onRefresh?: () => void;
  refreshTrigger?: number;
}

// Status labels y colores
const STATUS_CONFIG: Record<string, { label: string; color: 'success' | 'warning' | 'danger' | 'primary' | 'neutral' }> = {
  pending: { label: 'Pendiente', color: 'neutral' },
  processing: { label: 'Procesando', color: 'primary' },
  completed: { label: 'Completado', color: 'success' },
  failed: { label: 'Fallido', color: 'danger' }
};

// State type for useReducer
interface HistoryState {
  generations: VideoGeneration[];
  pagination: PaginationInfo | null;
  loading: boolean;
  error: string | null;
  searchTerm: string;
  filterStatus: string;
  currentPage: number;
  pageSize: number;
  selectedGeneration: VideoGeneration | null;
  previewModalOpen: boolean;
  deleteModalOpen: boolean;
  generationToDelete: VideoGeneration | null;
  deleting: boolean;
}

// Action types for useReducer
type HistoryAction =
  | { type: 'SET_GENERATIONS'; payload: VideoGeneration[] }
  | { type: 'SET_PAGINATION'; payload: PaginationInfo | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_SEARCH_TERM'; payload: string }
  | { type: 'SET_FILTER_STATUS'; payload: string }
  | { type: 'SET_CURRENT_PAGE'; payload: number }
  | { type: 'SET_SELECTED_GENERATION'; payload: VideoGeneration | null }
  | { type: 'SET_PREVIEW_MODAL_OPEN'; payload: boolean }
  | { type: 'SET_DELETE_MODAL_OPEN'; payload: boolean }
  | { type: 'SET_GENERATION_TO_DELETE'; payload: VideoGeneration | null }
  | { type: 'SET_DELETING'; payload: boolean }
  | { type: 'RESET_FILTERS' };

// Initial state
const initialState: HistoryState = {
  generations: [],
  pagination: null,
  loading: true,
  error: null,
  searchTerm: '',
  filterStatus: 'all',
  currentPage: 1,
  pageSize: 10,
  selectedGeneration: null,
  previewModalOpen: false,
  deleteModalOpen: false,
  generationToDelete: null,
  deleting: false
};

// Reducer function
function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'SET_GENERATIONS':
      return { ...state, generations: action.payload };
    case 'SET_PAGINATION':
      return { ...state, pagination: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_SEARCH_TERM':
      return { ...state, searchTerm: action.payload, currentPage: 1 };
    case 'SET_FILTER_STATUS':
      return { ...state, filterStatus: action.payload, currentPage: 1 };
    case 'SET_CURRENT_PAGE':
      return { ...state, currentPage: action.payload };
    case 'SET_SELECTED_GENERATION':
      return { ...state, selectedGeneration: action.payload };
    case 'SET_PREVIEW_MODAL_OPEN':
      return { ...state, previewModalOpen: action.payload };
    case 'SET_DELETE_MODAL_OPEN':
      return { ...state, deleteModalOpen: action.payload };
    case 'SET_GENERATION_TO_DELETE':
      return { ...state, generationToDelete: action.payload };
    case 'SET_DELETING':
      return { ...state, deleting: action.payload };
    case 'RESET_FILTERS':
      return { ...state, searchTerm: '', filterStatus: 'all', currentPage: 1 };
    default:
      return state;
  }
}

export default function VideoGenerationHistory({
  onRefresh,
  refreshTrigger = 0
}: VideoGenerationHistoryProps) {
  // Helper para logging solo en desarrollo
  const isDev = import.meta.env.DEV;
  const devError = (...args: any[]) => {
    if (isDev) console.error(...args);
  };

  // Replace multiple useState calls with single useReducer
  const [state, dispatch] = useReducer(historyReducer, initialState);

  // Cargar generaciones
  const loadGenerations = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      dispatch({ type: 'SET_ERROR', payload: null });

      const params: Record<string, any> = {
        pageNumber: state.currentPage,
        pageSize: state.pageSize
      };

      if (state.searchTerm.trim()) {
        params.searchParam = state.searchTerm.trim();
      }

      if (state.filterStatus !== 'all') {
        params.status = state.filterStatus;
      }

      const response = await aiVideoGenerationApi.listGenerations(params);
      dispatch({ type: 'SET_GENERATIONS', payload: response.generations });
      dispatch({ type: 'SET_PAGINATION', payload: response.pagination });
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Error al cargar el historial';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      devError('Error loading video generations:', err);
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.currentPage, state.pageSize, state.searchTerm, state.filterStatus]);

  // Cargar al montar y cuando cambian filtros
  useEffect(() => {
    loadGenerations();
  }, [loadGenerations, refreshTrigger]);

  // Formatear fecha
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  // Truncar texto
  const truncateText = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  // Manejar búsqueda
  const handleSearch = () => {
    dispatch({ type: 'SET_CURRENT_PAGE', payload: 1 });
    loadGenerations();
  };

  // Manejar preview
  const handlePreview = (generation: VideoGeneration) => {
    dispatch({ type: 'SET_SELECTED_GENERATION', payload: generation });
    dispatch({ type: 'SET_PREVIEW_MODAL_OPEN', payload: true });
  };

  // Manejar descarga de video
  const handleDownload = async (generation: VideoGeneration, video: VideoGenerationItem) => {
    try {
      toast.info('Iniciando descarga...');
      await aiVideoGenerationApi.downloadAndSaveVideo(
        generation.id,
        video.id,
        video.fileName
      );
      toast.success('Video descargado exitosamente');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al descargar video');
    }
  };

  // Manejar eliminación
  const handleDeleteClick = (generation: VideoGeneration) => {
    dispatch({ type: 'SET_GENERATION_TO_DELETE', payload: generation });
    dispatch({ type: 'SET_DELETE_MODAL_OPEN', payload: true });
  };

  const handleDeleteConfirm = async () => {
    if (!state.generationToDelete) return;

    try {
      dispatch({ type: 'SET_DELETING', payload: true });
      await aiVideoGenerationApi.deleteGeneration(state.generationToDelete.id);
      toast.success('Generación eliminada exitosamente');
      dispatch({ type: 'SET_DELETE_MODAL_OPEN', payload: false });
      dispatch({ type: 'SET_GENERATION_TO_DELETE', payload: null });
      loadGenerations();
      onRefresh?.();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al eliminar');
    } finally {
      dispatch({ type: 'SET_DELETING', payload: false });
    }
  };

  // Manejar cambio de página
  const handlePageChange = (newPage: number) => {
    dispatch({ type: 'SET_CURRENT_PAGE', payload: newPage });
  };

  // Obtener URL de video (para preview)
  const getVideoUrl = (generation: VideoGeneration, video: VideoGenerationItem): string => {
    const baseUrl = import.meta.env.VITE_API_URL || '';
    // Sanitize filename to prevent path traversal attacks
    const sanitizedFileName = video.fileName.replace(/[^a-zA-Z0-9._-]/g, '');
    return `${baseUrl}/public/company${generation.companyId || ''}/ai-videos/${encodeURIComponent(sanitizedFileName)}`;
  };

  return (
    <Box>
      {/* Filtros */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid xs={12} sm={4}>
              <Input
                placeholder="Buscar en prompts..."
                startDecorator={<SearchIcon />}
                value={state.searchTerm}
                onChange={(e) => dispatch({ type: 'SET_SEARCH_TERM', payload: e.target.value })}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </Grid>
            <Grid xs={12} sm={3}>
              <Select
                value={state.filterStatus}
                onChange={(_, val) => {
                  dispatch({ type: 'SET_FILTER_STATUS', payload: val || 'all' });
                }}
              >
                <Option value="all">Todos los estados</Option>
                <Option value="completed">Completados</Option>
                <Option value="processing">Procesando</Option>
                <Option value="pending">Pendientes</Option>
                <Option value="failed">Fallidos</Option>
              </Select>
            </Grid>
            <Grid xs={12} sm={2}>
              <Button
                variant="outlined"
                startDecorator={<SearchIcon />}
                onClick={handleSearch}
                fullWidth
              >
                Buscar
              </Button>
            </Grid>
            <Grid xs={12} sm={3} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <IconButton
                variant="outlined"
                onClick={loadGenerations}
                disabled={state.loading}
              >
                <RefreshIcon />
              </IconButton>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Error */}
      {state.error && (
        <Alert color="danger" sx={{ mb: 2 }}>
          {state.error}
        </Alert>
      )}

      {/* Tabla */}
      <Card>
        <Sheet sx={{ overflow: 'auto' }}>
          {state.loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : state.generations.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <VideocamIcon sx={{ fontSize: 48, color: 'text.tertiary', mb: 1 }} />
              <Typography level="body-lg" sx={{ color: 'text.tertiary' }}>
                No hay generaciones de video
              </Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Crea tu primer video con IA
              </Typography>
            </Box>
          ) : (
            <Table
              stickyHeader
              hoverRow
              sx={{
                '& thead th': { fontWeight: 'bold', bgcolor: 'background.level1' }
              }}
            >
              <thead>
                <tr>
                  <th style={{ width: 180 }}>Fecha</th>
                  <th>Prompt</th>
                  <th style={{ width: 120 }}>Tamaño</th>
                  <th style={{ width: 100 }}>Duración</th>
                  <th style={{ width: 120 }}>Estado</th>
                  <th style={{ width: 80, textAlign: 'right' }}>Créditos</th>
                  <th style={{ width: 120, textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {state.generations.map((gen: VideoGeneration) => (
                  <tr key={gen.id}>
                    <td>
                      <Typography level="body-xs">
                        {formatDate(gen.createdAt)}
                      </Typography>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {gen.user?.name || 'Usuario'}
                      </Typography>
                    </td>
                    <td>
                      <Tooltip title={gen.prompt} placement="top">
                        <Typography level="body-sm">
                          {truncateText(gen.prompt, 60)}
                        </Typography>
                      </Tooltip>
                    </td>
                    <td>
                      <Chip size="sm" variant="soft">
                        {gen.videoSize}
                      </Chip>
                    </td>
                    <td>
                      <Chip size="sm" variant="soft">
                        {gen.duration}s
                      </Chip>
                    </td>
                    <td>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {gen.status === 'processing' && (
                          <CircularProgress size="sm" sx={{ '--CircularProgress-size': '16px' }} />
                        )}
                        <Chip
                          size="sm"
                          variant="soft"
                          color={STATUS_CONFIG[gen.status]?.color || 'neutral'}
                        >
                          {STATUS_CONFIG[gen.status]?.label || gen.status}
                        </Chip>
                      </Box>
                      {gen.status === 'processing' && gen.progress !== undefined && (
                        <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                          {gen.progress}%
                        </Typography>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Typography level="body-sm" sx={{ fontWeight: 'medium' }}>
                        {gen.totalCreditsUsed}
                      </Typography>
                    </td>
                    <td>
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        <Tooltip title="Ver video">
                          <IconButton
                            size="sm"
                            variant="outlined"
                            onClick={() => handlePreview(gen)}
                            disabled={!gen.videos?.length}
                          >
                            <VisibilityIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Eliminar">
                          <IconButton
                            size="sm"
                            variant="outlined"
                            color="danger"
                            onClick={() => handleDeleteClick(gen)}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Sheet>

        {/* Paginación */}
        {state.pagination && state.pagination.totalPages > 1 && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 2,
              borderTop: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
              Mostrando {state.generations.length} de {state.pagination.totalItems} generaciones
            </Typography>

            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <IconButton
                size="sm"
                variant="outlined"
                disabled={state.currentPage === 1}
                onClick={() => handlePageChange(state.currentPage - 1)}
              >
                <ChevronLeftIcon />
              </IconButton>

              <Typography level="body-sm">
                Página {state.currentPage} de {state.pagination.totalPages}
              </Typography>

              <IconButton
                size="sm"
                variant="outlined"
                disabled={!state.pagination.hasMore}
                onClick={() => handlePageChange(state.currentPage + 1)}
              >
                <ChevronRightIcon />
              </IconButton>
            </Box>
          </Box>
        )}
      </Card>

      {/* Modal de Vista Previa */}
      <Modal open={state.previewModalOpen} onClose={() => dispatch({ type: 'SET_PREVIEW_MODAL_OPEN', payload: false })}>
        <ModalDialog sx={{ minWidth: { xs: '95vw', md: 800 }, maxWidth: 1000 }}>
          <ModalClose />
          <Typography level="h4" sx={{ mb: 2 }}>
            Vista Previa de Video
          </Typography>

          {state.selectedGeneration && (
            <Box>
              <Card variant="soft" sx={{ mb: 2 }}>
                <CardContent>
                  <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                    Prompt
                  </Typography>
                  <Typography level="body-md">
                    {state.selectedGeneration.prompt}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                    <Chip size="sm">{state.selectedGeneration.videoSize}</Chip>
                    <Chip size="sm">{state.selectedGeneration.duration}s</Chip>
                    <Chip size="sm">{state.selectedGeneration.model}</Chip>
                    {state.selectedGeneration.stylePreset && (
                      <Chip size="sm">{state.selectedGeneration.stylePreset}</Chip>
                    )}
                    <Chip
                      size="sm"
                      color={STATUS_CONFIG[state.selectedGeneration.status]?.color}
                    >
                      {STATUS_CONFIG[state.selectedGeneration.status]?.label}
                    </Chip>
                  </Box>
                </CardContent>
              </Card>

              {state.selectedGeneration.videos?.map((video: VideoGenerationItem) => (
                <Box key={video.id} sx={{ mb: 2 }}>
                  <video
                    controls
                    style={{ width: '100%', maxHeight: '500px' }}
                    src={getVideoUrl(state.selectedGeneration!, video)}
                  >
                    Tu navegador no soporta videos.
                  </video>
                  <Card sx={{ mt: 1 }}>
                    <CardContent>
                      <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                        {video.fileName}
                      </Typography>
                      {video.fileSize && (
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {(video.fileSize / 1024 / 1024).toFixed(2)} MB
                        </Typography>
                      )}
                      <Button
                        size="sm"
                        variant="outlined"
                        startDecorator={<DownloadIcon />}
                        onClick={() => handleDownload(state.selectedGeneration!, video)}
                        sx={{ mt: 1 }}
                        fullWidth
                      >
                        Descargar
                      </Button>
                    </CardContent>
                  </Card>
                </Box>
              ))}

              {(!state.selectedGeneration.videos || state.selectedGeneration.videos.length === 0) && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <VideocamIcon sx={{ fontSize: 48, color: 'text.tertiary', mb: 1 }} />
                  <Typography level="body-lg" sx={{ color: 'text.tertiary' }}>
                    No hay videos disponibles
                  </Typography>
                </Box>
              )}
            </Box>
          )}
        </ModalDialog>
      </Modal>

      {/* Modal de Confirmación de Eliminación */}
      <Modal open={state.deleteModalOpen} onClose={() => dispatch({ type: 'SET_DELETE_MODAL_OPEN', payload: false })}>
        <ModalDialog variant="outlined" role="alertdialog">
          <Typography level="h4" startDecorator={<DeleteIcon color="error" />}>
            Confirmar Eliminación
          </Typography>
          <Typography level="body-md" sx={{ mt: 2 }}>
            ¿Estás seguro de que deseas eliminar esta generación?
            {state.generationToDelete && (
              <Box sx={{ mt: 1, p: 1, bgcolor: 'background.level1', borderRadius: 'sm' }}>
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                  {truncateText(state.generationToDelete.prompt, 100)}
                </Typography>
                <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                  {state.generationToDelete.videos?.length || 0} video(s) serán eliminados permanentemente.
                </Typography>
              </Box>
            )}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 2 }}>
            <Button
              variant="outlined"
              color="neutral"
              onClick={() => dispatch({ type: 'SET_DELETE_MODAL_OPEN', payload: false })}
              disabled={state.deleting}
            >
              Cancelar
            </Button>
            <Button
              variant="solid"
              color="danger"
              onClick={handleDeleteConfirm}
              loading={state.deleting}
            >
              Eliminar
            </Button>
          </Box>
        </ModalDialog>
      </Modal>
    </Box>
  );
}
