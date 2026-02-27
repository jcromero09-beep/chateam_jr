/**
 * WhatsApp Background Pattern
 * Patrón de fondo característico de WhatsApp Web
 */

import { Box, useColorScheme } from '@mui/joy'

export default function WhatsAppBackground() {
  const { mode } = useColorScheme()
  const isDark = mode === 'dark'

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        backgroundColor: isDark ? '#0b141a' : '#EFEAE2',
        opacity: 1,
        overflow: 'hidden',
      }}
    >
      {/* SVG Pattern - WhatsApp tile pattern */}
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
            {/* WhatsApp characteristic pattern */}
            <g opacity={isDark ? '0.06' : '0.04'}>
              {/* Main shape */}
              <path
                d="M140 20 L160 40 L160 100 L140 120 L120 100 L120 40 Z"
                fill={isDark ? '#ffffff' : '#54656F'}
              />
              <path
                d="M80 60 L100 80 L100 140 L80 160 L60 140 L60 80 Z"
                fill={isDark ? '#ffffff' : '#54656F'}
              />
              <path
                d="M200 60 L220 80 L220 140 L200 160 L180 140 L180 80 Z"
                fill={isDark ? '#ffffff' : '#54656F'}
              />

              {/* Additional decorative shapes */}
              <path
                d="M140 140 L160 160 L160 220 L140 240 L120 220 L120 160 Z"
                fill={isDark ? '#ffffff' : '#54656F'}
              />
              <path
                d="M20 100 L40 120 L40 180 L20 200 L0 180 L0 120 Z"
                fill={isDark ? '#ffffff' : '#54656F'}
              />
              <path
                d="M260 100 L280 120 L280 180 L260 200 L240 180 L240 120 Z"
                fill={isDark ? '#ffffff' : '#54656F'}
              />

              {/* Subtle connecting lines */}
              <line x1="140" y1="120" x2="140" y2="140" stroke={isDark ? '#ffffff' : '#54656F'} strokeWidth="1" opacity="0.3" />
              <line x1="100" y1="80" x2="120" y2="100" stroke={isDark ? '#ffffff' : '#54656F'} strokeWidth="1" opacity="0.3" />
              <line x1="180" y1="80" x2="160" y2="100" stroke={isDark ? '#ffffff' : '#54656F'} strokeWidth="1" opacity="0.3" />
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#whatsapp-pattern)" />
      </svg>

      {/* Overlay gradient for depth */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: isDark
            ? 'linear-gradient(180deg, rgba(17,27,33,0) 0%, rgba(17,27,33,0.4) 100%)'
            : 'linear-gradient(180deg, rgba(239,234,226,0) 0%, rgba(239,234,226,0.2) 100%)',
          pointerEvents: 'none',
        }}
      />
    </Box>
  )
}
