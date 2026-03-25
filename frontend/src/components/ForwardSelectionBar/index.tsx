import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Stack,
} from '@mui/joy'
import {
  Close as CloseIcon,
  Forward as ForwardIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material'

interface ForwardSelectionBarProps {
  mode: 'forward' | 'delete'
  selectedCount: number
  onCancel: () => void
  onAction: () => void
  loading: boolean
}

export default function ForwardSelectionBar({
  mode,
  selectedCount,
  onCancel,
  onAction,
  loading,
}: ForwardSelectionBarProps) {
  const isDelete = mode === 'delete'
  const color = isDelete ? '#ef4444' : '#52b788'
  const bgColor = isDelete ? 'rgba(239,68,68,0.1)' : 'rgba(82,183,136,0.1)'

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1400,
        bgcolor: bgColor,
        backdropFilter: 'blur(12px)',
        borderRadius: 'xl',
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        border: `1px solid ${color}`,
        px: 3,
        py: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        minWidth: 360,
        maxWidth: '90vw',
      }}
    >
      {/* Ícono + cantidad */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1 }}>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            bgcolor: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isDelete ? (
            <DeleteIcon sx={{ fontSize: 18, color: 'white' }} />
          ) : (
            <ForwardIcon sx={{ fontSize: 18, color: 'white' }} />
          )}
        </Box>
        <Typography level="title-sm" sx={{ fontWeight: 700, color }}>
          {selectedCount} mensaje{selectedCount !== 1 ? 's' : ''} seleccionad{selectedCount !== 1 ? 'os' : 'o'}
        </Typography>
      </Stack>

      {/* Botón cancelar */}
      <Button
        variant="soft"
        color="neutral"
        size="sm"
        startDecorator={<CloseIcon sx={{ fontSize: 16 }} />}
        onClick={onCancel}
        disabled={loading}
      >
        Cancelar
      </Button>

      {/* Botón de acción */}
      <Button
        variant="solid"
        size="sm"
        onClick={onAction}
        loading={loading}
        disabled={selectedCount === 0}
        sx={{
          bgcolor: color,
          '&:hover': { bgcolor: isDelete ? '#dc2626' : '#40916c' },
          minWidth: 120,
        }}
        startDecorator={
          loading ? undefined : (
            isDelete ? <DeleteIcon sx={{ fontSize: 16 }} /> : <ForwardIcon sx={{ fontSize: 16 }} />
          )
        }
      >
        {loading ? (
          <CircularProgress size="sm" sx={{ '--CircularProgress-size': '16px' }} />
        ) : isDelete ? (
          'Eliminar'
        ) : (
          'Reenviar'
        )}
      </Button>
    </Box>
  )
}
