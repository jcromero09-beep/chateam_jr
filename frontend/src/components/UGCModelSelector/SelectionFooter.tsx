import { Box, Sheet, Stack, Typography, Button, Chip } from '@mui/joy'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import type { FalCatalogEntry } from '../../services/ugcModelSelectorService'

interface SelectionFooterProps {
  selectedVideoModel: FalCatalogEntry | null
  selectedImageModel: FalCatalogEntry | null
  saving: boolean
  onSave: () => void
  onCancel: () => void
}

/**
 * Footer sticky con los modelos seleccionados (video + image-edit) y
 * los botones Guardar/Cancelar. Visible siempre — recuerda al usuario
 * que la selección todavía no está persistida.
 */
function SelectionFooter({
  selectedVideoModel,
  selectedImageModel,
  saving,
  onSave,
  onCancel
}: SelectionFooterProps) {
  const hasSelection = Boolean(selectedVideoModel || selectedImageModel)

  return (
    <Sheet
      variant="solid"
      color="neutral"
      sx={{
        position: 'sticky',
        bottom: 0,
        left: 0,
        right: 0,
        py: 1.5,
        px: 3,
        backgroundColor: '#1e293b',
        color: '#fff',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        zIndex: 10
      }}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        alignItems={{ xs: 'stretch', md: 'center' }}
        justifyContent="space-between"
      >
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <Typography level="body-sm" sx={{ color: 'rgba(255,255,255,0.7)' }}>
            Selección actual:
          </Typography>

          {selectedVideoModel ? (
            <Chip
              variant="soft"
              color="primary"
              startDecorator={<CheckCircleRoundedIcon />}
              size="md"
            >
              Video: {selectedVideoModel.displayName}
            </Chip>
          ) : (
            <Chip variant="soft" color="neutral" size="md">
              Sin modelo de video
            </Chip>
          )}

          {selectedImageModel ? (
            <Chip
              variant="soft"
              color="primary"
              startDecorator={<CheckCircleRoundedIcon />}
              size="md"
            >
              Imagen: {selectedImageModel.displayName}
            </Chip>
          ) : (
            <Chip variant="soft" color="neutral" size="md">
              Sin modelo de imagen
            </Chip>
          )}
        </Stack>

        <Box
          sx={{
            display: 'flex',
            gap: 1,
            justifyContent: { xs: 'flex-end', md: 'flex-end' }
          }}
        >
          <Button
            variant="outlined"
            color="neutral"
            onClick={onCancel}
            disabled={saving}
            sx={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}
          >
            Cancelar
          </Button>
          <Button
            variant="solid"
            color="primary"
            onClick={onSave}
            loading={saving}
            disabled={!hasSelection}
          >
            Guardar selección
          </Button>
        </Box>
      </Stack>
    </Sheet>
  )
}

export default SelectionFooter
