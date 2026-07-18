/**
 * Chat background with soft Chateam decorative lines.
 */

import { Box, useColorScheme } from '@mui/joy'

export default function FacebookBackground() {
  const { mode } = useColorScheme()
  const isDark = mode === 'dark'
  const decorativeLine = isDark
    ? 'rgba(255, 255, 255, 0.06)'
    : 'rgba(232, 220, 203, 0.35)'

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        background: isDark
          ? 'linear-gradient(180deg, #18191A 0%, #101112 100%)'
          : 'linear-gradient(180deg, #FAF7F0 0%, #F3EDE2 100%)',
        overflow: 'hidden',
      }}
    >
      {/* Soft decorative lines */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            linear-gradient(115deg, transparent 0 52px, ${decorativeLine} 52px 53px, transparent 53px 138px),
            linear-gradient(65deg, transparent 0 78px, ${decorativeLine} 78px 79px, transparent 79px 164px)
          `,
          backgroundSize: '420px 420px, 520px 520px',
          backgroundPosition: '0 0, 84px 48px',
          opacity: isDark ? 0.65 : 0.32,
          pointerEvents: 'none',
        }}
      />

      {/* Very subtle noise texture for depth */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          opacity: isDark ? 0.015 : 0.018,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          pointerEvents: 'none',
        }}
      />
    </Box>
  )
}
