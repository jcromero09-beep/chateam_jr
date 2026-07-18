/**
 * Empty chat background with soft Chateam decorative pattern.
 */

import { Box, useColorScheme } from '@mui/joy'

export default function WhatsAppBackground() {
  const { mode } = useColorScheme()
  const isDark = mode === 'dark'
  const patternFill = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(232, 220, 203, 0.12)'
  const patternLine = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(232, 220, 203, 0.35)'

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        background: isDark
          ? 'linear-gradient(180deg, #0b141a 0%, #111b21 100%)'
          : 'linear-gradient(180deg, #FAF7F0 0%, #F3EDE2 100%)',
        opacity: 1,
        overflow: 'hidden',
      }}
    >
      <svg
        width="100%"
        height="100%"
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <defs>
          <pattern
            id="whatsapp-pattern"
            x="0"
            y="0"
            width="280"
            height="280"
            patternUnits="userSpaceOnUse"
          >
            <g opacity={isDark ? 0.8 : 0.42}>
              <path
                d="M140 20 L160 40 L160 100 L140 120 L120 100 L120 40 Z"
                fill={patternFill}
              />
              <path
                d="M80 60 L100 80 L100 140 L80 160 L60 140 L60 80 Z"
                fill={patternFill}
              />
              <path
                d="M200 60 L220 80 L220 140 L200 160 L180 140 L180 80 Z"
                fill={patternFill}
              />
              <path
                d="M140 140 L160 160 L160 220 L140 240 L120 220 L120 160 Z"
                fill={patternFill}
              />
              <path
                d="M20 100 L40 120 L40 180 L20 200 L0 180 L0 120 Z"
                fill={patternFill}
              />
              <path
                d="M260 100 L280 120 L280 180 L260 200 L240 180 L240 120 Z"
                fill={patternFill}
              />
              <line x1="140" y1="120" x2="140" y2="140" stroke={patternLine} strokeWidth="1" />
              <line x1="100" y1="80" x2="120" y2="100" stroke={patternLine} strokeWidth="1" />
              <line x1="180" y1="80" x2="160" y2="100" stroke={patternLine} strokeWidth="1" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#whatsapp-pattern)" />
      </svg>
    </Box>
  )
}
