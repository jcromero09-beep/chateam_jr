import React, { useEffect, useCallback } from 'react'
import {
  Modal, Box, IconButton, Typography, Stack
} from '@mui/joy'
import CloseIcon from '@mui/icons-material/Close'
import DownloadIcon from '@mui/icons-material/Download'
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'

interface LightboxMedia {
  id: number
  src: string
  type: string // 'image' | 'video'
}

interface MediaLightboxProps {
  open: boolean
  onClose: () => void
  currentSrc: string
  currentType: string
  currentIndex: number
  allMedia: LightboxMedia[]
  isDark: boolean
  onNavigate: (src: string, type: string, index: number) => void
}

export default function MediaLightbox({
  open,
  onClose,
  currentSrc,
  currentType,
  currentIndex,
  allMedia,
  isDark,
  onNavigate,
}: MediaLightboxProps) {
  const [zoomed, setZoomed] = React.useState(false)

  const total = allMedia.length

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      const prev = allMedia[currentIndex - 1]
      onNavigate(prev.src, prev.type, currentIndex - 1)
      setZoomed(false)
    }
  }, [currentIndex, allMedia, onNavigate])

  const goNext = useCallback(() => {
    if (currentIndex < total - 1) {
      const next = allMedia[currentIndex + 1]
      onNavigate(next.src, next.type, currentIndex + 1)
      setZoomed(false)
    }
  }, [currentIndex, allMedia, total, onNavigate])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose, goPrev, goNext])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  const isVideo = currentType === 'video'

  // Fuerza la descarga vía backend (Content-Disposition) — el atributo `download`
  // se ignora entre dominios distintos (frontend vs backend).
  const downloadName =
    decodeURIComponent(currentSrc.split('?')[0].split('/').pop() || 'media') || 'media'
  const downloadUrl = `${currentSrc}${currentSrc.includes('?') ? '&' : '?'}download=${encodeURIComponent(downloadName)}`

  return (
    <Modal
      open={open}
      onClose={onClose}
      sx={{
        backdropFilter: 'blur(4px)',
        bgcolor: 'rgba(0,0,0,0.85)',
      }}
      slotProps={{
        backdrop: {
          onClick: handleBackdropClick,
        },
      }}
    >
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          outline: 'none',
        }}
        onClick={handleBackdropClick}
      >
        {/* Header: título + cerrar */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            p: 2,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)',
            zIndex: 2,
          }}
        >
          <Typography sx={{ color: '#fff', fontWeight: 600 }}>
            {total > 1 ? `${currentIndex + 1} de ${total}` : 'Media'}
          </Typography>
          <Stack direction="row" spacing={1}>
            {/* Descargar */}
            <IconButton
              component="a"
              href={downloadUrl}
              download={downloadName}
              size="sm"
              sx={{ color: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
            >
              <DownloadIcon />
            </IconButton>
            {/* Cerrar */}
            <IconButton
              onClick={onClose}
              size="sm"
              sx={{ color: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
            >
              <CloseIcon />
            </IconButton>
          </Stack>
        </Box>

        {/* Navegación izquierda */}
        {currentIndex > 0 && (
          <IconButton
            onClick={(e) => {
              e.stopPropagation()
              goPrev()
            }}
            sx={{
              position: 'absolute',
              left: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#fff',
              bgcolor: 'rgba(0,0,0,0.4)',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' },
              zIndex: 2,
            }}
          >
            <NavigateBeforeIcon sx={{ fontSize: 32 }} />
          </IconButton>
        )}

        {/* Media */}
        <Box
          onClick={(e) => {
            e.stopPropagation()
            if (!isVideo) setZoomed((z) => !z)
          }}
          sx={{
            maxWidth: '90vw',
            maxHeight: '90vh',
            outline: 'none',
          }}
        >
          {isVideo ? (
            <Box
              component="video"
              src={currentSrc}
              controls
              autoPlay
              playsInline
              sx={{
                maxWidth: '90vw',
                maxHeight: '90vh',
                borderRadius: '8px',
              }}
            />
          ) : (
            <Box
              component="img"
              src={currentSrc}
              alt="Media"
              draggable={false}
              sx={{
                maxWidth: zoomed ? 'none' : '90vw',
                maxHeight: zoomed ? 'none' : '90vh',
                width: zoomed ? 'auto' : 'auto',
                height: zoomed ? 'auto' : 'auto',
                objectFit: 'contain',
                borderRadius: '8px',
                cursor: zoomed ? 'zoom-out' : 'zoom-in',
                transition: 'max-width 0.2s, max-height 0.2s',
              }}
            />
          )}
        </Box>

        {/* Navegación derecha */}
        {currentIndex < total - 1 && (
          <IconButton
            onClick={(e) => {
              e.stopPropagation()
              goNext()
            }}
            sx={{
              position: 'absolute',
              right: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#fff',
              bgcolor: 'rgba(0,0,0,0.4)',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.6)' },
              zIndex: 2,
            }}
          >
            <NavigateNextIcon sx={{ fontSize: 32 }} />
          </IconButton>
        )}
      </Box>
    </Modal>
  )
}
