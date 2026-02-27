/**
 * Messenger Background con acentos Teal
 * Fondo limpio y moderno inspirado en Messenger
 * Sin patron repetitivo - diseno minimalista
 */

import { Box, useColorScheme } from '@mui/joy'

export default function FacebookBackground() {
  const { mode } = useColorScheme()
  const isDark = mode === 'dark'

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        backgroundColor: isDark ? '#18191A' : '#FFFFFF',
        overflow: 'hidden',
      }}
    >
      {/* Subtle gradient overlay for depth - Facebook style */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: isDark
            ? 'linear-gradient(180deg, rgba(24,25,26,0) 0%, rgba(24,25,26,0.3) 50%, rgba(24,25,26,0.5) 100%)'
            : 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(240,242,245,0.3) 50%, rgba(240,242,245,0.5) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Very subtle noise texture for modern feel */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          opacity: isDark ? 0.015 : 0.02,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          pointerEvents: 'none',
        }}
      />

      {/* Decorative subtle circles - Facebook/Meta style */}
      <Box
        sx={{
          position: 'absolute',
          top: '10%',
          right: '5%',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: isDark
            ? 'radial-gradient(circle, rgba(91,194,210,0.04) 0%, rgba(91,194,210,0) 70%)'
            : 'radial-gradient(circle, rgba(91,194,210,0.03) 0%, rgba(91,194,210,0) 70%)',
          pointerEvents: 'none',
        }}
      />

      <Box
        sx={{
          position: 'absolute',
          bottom: '15%',
          left: '10%',
          width: 250,
          height: 250,
          borderRadius: '50%',
          background: isDark
            ? 'radial-gradient(circle, rgba(91,194,210,0.03) 0%, rgba(91,194,210,0) 70%)'
            : 'radial-gradient(circle, rgba(91,194,210,0.02) 0%, rgba(91,194,210,0) 70%)',
          pointerEvents: 'none',
        }}
      />
    </Box>
  )
}
