/**
 * Componente: ImageGenerationHistory
 * Lista el historial de generaciones de imágenes con filtros y paginación
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
  Tooltip,
  AspectRatio
} from '@mui/joy';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import ImageIcon from '@mui/icons-material/Image';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { toast } from 'react-toastify';
import aiImageGenerationApi, {
  ImageGeneration,
  ImageGenerationItem,
  PaginationInfo
} from '../services/aiImageGenerationApi';

interface ImageGenerationHistoryProps {
  onRefresh?: () => void;
  refreshTrigger?: number;
}

// Status labels y colores
const STATUS_CONFIG: Record<string, { label: string; color: 'success' | 'warning' | 'danger' | 'primary' | 'neutral' }> = {
  pending: { label: 'Pendiente', color: 'neutral' },
  processing: { label: 'Procesando', color: 'primary' },
  completed: { label: 'Completado', color: 'success' },
  failed: { label: 'Fallido', color: 'danger' },
  partial_failure: { label: 'Parcial', color: 'warning' }
};

// P2.32: State type for useReducer
interface HistoryState {
  generations: ImageGeneration[];
  pagination: PaginationInfo | null;
  loading: boolean;
  error: string | null;
  searchTerm: string;
  filterStatus: string;
  currentPage: number;
  pageSize: number;
  selectedGeneration: ImageGeneration | null;
  previewModalOpen: boolean;
  deleteModalOpen: boolean;
  generationToDelete: ImageGeneration | null;
  deleting: boolean;
}

// P2.32: Action types for useReducer
type HistoryAction =
  | { type: 'SET_GENERATIONS'; payload: ImageGeneration[] }
  | { type: 'SET_PAGINATION'; payload: PaginationInfo | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_SEARCH_TERM'; payload: string }
  | { type: 'SET_FILTER_STATUS'; payload: string }
  | { type: 'SET_CURRENT_PAGE'; payload: number }
  | { type: 'SET_SELECTED_GENERATION'; payload: ImageGeneration | null }
  | { type: 'SET_PREVIEW_MODAL_OPEN'; payload: boolean }
  | { type: 'SET_DELETE_MODAL_OPEN'; payload: boolean }
  | { type: 'SET_GENERATION_TO_DELETE'; payload: ImageGeneration | null }
  | { type: 'SET_DELETING'; payload: boolean }
  | { type: 'RESET_FILTERS' };

// P2.32: Initial state
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

// P2.32: Reducer function
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

export default function ImageGenerationHistory({
  onRefresh,
  refreshTrigger = 0
}: ImageGenerationHistoryProps) {
  // P3.44: Helper para logging solo en desarrollo
  const isDev = import.meta.env.DEV;
  const devError = (...args: any[]) => {
    if (isDev) console.error(...args);
  };

  // P2.32: Replace 13 useState calls with single useReducer
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

      const response = await aiImageGenerationApi.listGenerations(params);
      dispatch({ type: 'SET_GENERATIONS', payload: response.generations });
      dispatch({ type: 'SET_PAGINATION', payload: response.pagination });
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Error al cargar el historial';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
      devError('Error loading generations:', err);
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
  const handlePreview = (generation: ImageGeneration) => {
    dispatch({ type: 'SET_SELECTED_GENERATION', payload: generation });
    dispatch({ type: 'SET_PREVIEW_MODAL_OPEN', payload: true });
  };

  // Manejar descarga de imagen
  const handleDownload = async (generation: ImageGeneration, image: ImageGenerationItem) => {
    try {
      toast.info('Iniciando descarga...');
      await aiImageGenerationApi.downloadAndSaveImage(
        generation.id,
        image.id,
        image.fileName
      );
      toast.success('Imagen descargada exitosamente');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al descargar imagen');
    }
  };

  // Manejar eliminación
  const handleDeleteClick = (generation: ImageGeneration) => {
    dispatch({ type: 'SET_GENERATION_TO_DELETE', payload: generation });
    dispatch({ type: 'SET_DELETE_MODAL_OPEN', payload: true });
  };

  const handleDeleteConfirm = async () => {
    if (!state.generationToDelete) return;

    try {
      dispatch({ type: 'SET_DELETING', payload: true });
      await aiImageGenerationApi.deleteGeneration(state.generationToDelete.id);
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

  // Obtener URL de imagen (para preview)
  const getImageUrl = (generation: ImageGeneration, image: ImageGenerationItem): string => {
    // Construir URL relativa basada en la estructura del proyecto
    const baseUrl = import.meta.env.VITE_API_URL || '';
    // P0.6: Sanitize filename to prevent path traversal attacks
    const sanitizedFileName = image.fileName.replace(/[^a-zA-Z0-9._-]/g, '');
    return `${baseUrl}/public/company${generation.companyId || ''}/ai-images/${encodeURIComponent(sanitizedFileName)}`;
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
                <Option value="partial_failure">Parciales</Option>
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
              <ImageIcon sx={{ fontSize: 48, color: 'text.tertiary', mb: 1 }} />
              <Typography level="body-lg" sx={{ color: 'text.tertiary' }}>
                No hay generaciones
              </Typography>
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Crea tu primera imagen con IA
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
                  <th style={{ width: 100 }}>Tamaño</th>
                  <th style={{ width: 60, textAlign: 'center' }}>Imgs</th>
                  <th style={{ width: 100 }}>Estado</th>
                  <th style={{ width: 80, textAlign: 'right' }}>Créditos</th>
                  <th style={{ width: 120, textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {state.generations.map((gen: ImageGeneration) => (
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
                        {gen.imageSize}
                      </Chip>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <Typography level="body-sm">
                        {gen.images?.length || 0}/{gen.numberOfImages}
                      </Typography>
                    </td>
                    <td>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={STATUS_CONFIG[gen.status]?.color || 'neutral'}
                      >
                        {STATUS_CONFIG[gen.status]?.label || gen.status}
                      </Chip>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Typography level="body-sm" sx={{ fontWeight: 'medium' }}>
                        {gen.totalCreditsUsed}
                      </Typography>
                    </td>
                    <td>
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        <Tooltip title="Ver imágenes">
                          <IconButton
                            size="sm"
                            variant="outlined"
                            onClick={() => handlePreview(gen)}
                            disabled={!gen.images?.length}
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
            Vista Previa de Imágenes
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
                    <Chip size="sm">{state.selectedGeneration.imageSize}</Chip>
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

              <Grid container spacing={2}>
                {state.selectedGeneration.images?.map((image: ImageGenerationItem) => (
                  <Grid key={image.id} xs={12} sm={6} md={4}>
                    <Card>
                      <AspectRatio ratio="1">
                        <img
                          src={getImageUrl(state.selectedGeneration!, image)}
                          alt={`Imagen generada ${image.id}`}
                          style={{ objectFit: 'cover' }}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            // Prevenir bucle infinito verificando si ya se intentó cargar el placeholder
                            if (!target.dataset.errorHandled) {
                              target.dataset.errorHandled = 'true';
                              // Usar una imagen SVG placeholder inline (data URI) en lugar de cargar otra imagen
                              target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect fill="%23ddd" width="400" height="400"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="20"%3EImagen no disponible%3C/text%3E%3C/svg%3E';
                            }
                          }}
                        />
                      </AspectRatio>
                      <CardContent>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {image.fileName}
                        </Typography>
                        {image.fileSize && (
                          <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                            {(image.fileSize / 1024).toFixed(1)} KB
                          </Typography>
                        )}
                        <Button
                          size="sm"
                          variant="outlined"
                          startDecorator={<DownloadIcon />}
                          onClick={() => handleDownload(state.selectedGeneration!, image)}
                          sx={{ mt: 1 }}
                          fullWidth
                        >
                          Descargar
                        </Button>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>

              {(!state.selectedGeneration.images || state.selectedGeneration.images.length === 0) && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <ImageIcon sx={{ fontSize: 48, color: 'text.tertiary', mb: 1 }} />
                  <Typography level="body-lg" sx={{ color: 'text.tertiary' }}>
                    No hay imágenes disponibles
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
                  {state.generationToDelete.images?.length || 0} imagen(es) serán eliminadas permanentemente.
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
