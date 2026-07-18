/**
 * Component: DateSeparator
 * Muestra etiqueta de fecha centrada entre grupos de mensajes (estilo WhatsApp Web)
 */

import { Box, Typography } from '@mui/joy'

interface DateSeparatorProps {
  label: string
  isDark: boolean
}

export default function DateSeparator({ label, isDark }: DateSeparatorProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        my: 1.5,
        position: 'relative',
        zIndex: 1,
      }}
    >
      <Box
        sx={{
          bgcolor: isDark
            ? 'rgba(36, 37, 38, 0.92)'
            : 'rgba(255, 255, 255, 0.92)',
          borderRadius: '8px',
          px: 1.5,
          py: 0.5,
          boxShadow: isDark
            ? '0 1px 1px rgba(0, 0, 0, 0.15)'
            : '0 1px 1px rgba(0, 0, 0, 0.08)',
        }}
      >
        <Typography
          sx={{
            fontSize: '12px',
            fontWeight: 500,
            color: isDark ? '#B0B3B8' : '#65676B',
            textTransform: 'uppercase',
            letterSpacing: '0.3px',
            userSelect: 'none',
          }}
        >
          {label}
        </Typography>
      </Box>
    </Box>
  )
}
