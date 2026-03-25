import React, { useState } from 'react'
import { Box, Typography } from '@mui/joy'
import BrokenImageIcon from '@mui/icons-material/BrokenImage'

interface MediaImageProps {
  src: string
  isSticker?: boolean
  isDark: boolean
  caption?: string
  onLightboxOpen?: (src: string, type: string, currentIndex?: number, allMedia?: Array<{id: number; src: string; type: string}>) => void
}

export default function MediaImage({
  src,
  isSticker = false,
  isDark,
  caption,
  onLightboxOpen,
}: MediaImageProps) {
  const [error, setError] = useState(false)

  const handleClick = () => {
    if (onLightboxOpen && !isSticker) {
      onLightboxOpen(src, 'image')
    }
  }

  if (error) {
    return (
      <Box
        sx={{
          width: isSticker ? 120 : 200,
          height: isSticker ? 120 : 120,
          borderRadius: '8px',
          bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <BrokenImageIcon sx={{ fontSize: 32, color: 'text.disabled' }} />
      </Box>
    )
  }

  return (
    <Box>
      <Box
        component={onLightboxOpen && !isSticker ? 'button' : 'div'}
        onClick={handleClick}
        sx={{
          display: 'block',
          maxWidth: isSticker ? '200px' : '330px',
          width: '100%',
          borderRadius: isSticker ? 0 : '8px',
          overflow: 'hidden',
          bgcolor: 'transparent',
          border: 'none',
          p: 0,
          cursor: onLightboxOpen && !isSticker ? 'pointer' : 'default',
          ...(onLightboxOpen && !isSticker
            ? {
                '&:hover': { opacity: 0.9 },
                transition: 'opacity 0.15s',
              }
            : {}),
        }}
        type={onLightboxOpen && !isSticker ? 'button' : undefined}
      >
        <Box
          component="img"
          src={src}
          alt="Imagen"
          loading="lazy"
          onError={() => setError(true)}
          sx={{
            width: '100%',
            height: 'auto',
            maxHeight: isSticker ? '200px' : '400px',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </Box>
      {caption && (
        <Typography
          level="body-sm"
          sx={{
            mt: 0.5,
            color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)',
            wordBreak: 'break-word',
            maxWidth: '330px',
          }}
        >
          {caption}
        </Typography>
      )}
    </Box>
  )
}
