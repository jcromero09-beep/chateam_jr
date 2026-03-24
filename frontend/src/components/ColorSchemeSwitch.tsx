/**
 * ColorSchemeSwitch — Lotru-inspired pill-toggle para dark/light mode
 *
 * Tabs con estilo "custom pill" que se integra visualmente en el sidebar oscuro.
 * Persiste la preferencia en el sistema de MUI Joy (CssVarsProvider).
 */

import { Box, Typography, useColorScheme } from '@mui/joy'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'

export default function ColorSchemeSwitch() {
  const { mode, setMode } = useColorScheme()

  return (
    <Box
      sx={{
        display: 'flex',
        bgcolor: 'rgba(255,255,255,0.1)',
        borderRadius: 'var(--joy-radius-md)',
        p: '3px',
        gap: '3px',
      }}
    >
      {/* Light mode option */}
      <Box
        onClick={() => setMode('light')}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.75,
          flex: '1 1 auto',
          px: 1.5,
          py: 0.75,
          borderRadius: 'var(--joy-radius-sm)',
          cursor: 'pointer',
          transition: 'all 0.2s ease-in-out',
          bgcolor: mode === 'light' ? 'rgba(255,255,255,0.12)' : 'transparent',
          boxShadow: mode === 'light' ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
          '&:hover': {
            bgcolor: mode === 'light' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
          },
        }}
      >
        <LightModeIcon sx={{ fontSize: 16, color: mode === 'light' ? '#fff' : 'rgba(255,255,255,0.4)' }} />
        <Typography
          level="body-xs"
          sx={{
            color: mode === 'light' ? '#fff' : 'rgba(255,255,255,0.4)',
            fontWeight: mode === 'light' ? 600 : 400,
            userSelect: 'none',
          }}
        >
          Claro
        </Typography>
      </Box>

      {/* Dark mode option */}
      <Box
        onClick={() => setMode('dark')}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.75,
          flex: '1 1 auto',
          px: 1.5,
          py: 0.75,
          borderRadius: 'var(--joy-radius-sm)',
          cursor: 'pointer',
          transition: 'all 0.2s ease-in-out',
          bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'transparent',
          boxShadow: mode === 'dark' ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
          '&:hover': {
            bgcolor: mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
          },
        }}
      >
        <DarkModeIcon sx={{ fontSize: 16, color: mode === 'dark' ? '#fff' : 'rgba(255,255,255,0.4)' }} />
        <Typography
          level="body-xs"
          sx={{
            color: mode === 'dark' ? '#fff' : 'rgba(255,255,255,0.4)',
            fontWeight: mode === 'dark' ? 600 : 400,
            userSelect: 'none',
          }}
        >
          Oscuro
        </Typography>
      </Box>
    </Box>
  )
}
