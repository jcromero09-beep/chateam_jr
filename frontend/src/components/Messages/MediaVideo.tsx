import React from 'react'
import { Box } from '@mui/joy'

interface MediaVideoProps {
  src: string
  isDark: boolean
  onLightboxOpen?: (src: string, type: string, currentIndex?: number, allMedia?: Array<{id: number; src: string; type: string}>) => void
}

export default function MediaVideo({ src, isDark, onLightboxOpen }: MediaVideoProps) {
  const handleClick = (e: React.MouseEvent<HTMLVideoElement>) => {
    // Solo abre lightbox si clickea en el video pero NO en los controles
    const target = e.target as HTMLElement
    if (target.tagName !== 'VIDEO' || !onLightboxOpen) return
    // Abrir en lightbox solo si hizo click en la miniatura
  }

  return (
    <Box sx={{ maxWidth: '330px', width: '100%' }}>
      <Box
        component="video"
        src={src}
        controls
        preload="metadata"
        playsInline
        onClick={handleClick}
        sx={{
          width: '100%',
          borderRadius: '8px',
          maxHeight: '400px',
          objectFit: 'cover',
          bgcolor: isDark ? '#000' : '#000',
        }}
        poster={undefined}
      />
    </Box>
  )
}
