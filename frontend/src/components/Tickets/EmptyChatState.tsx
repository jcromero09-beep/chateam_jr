/**
 * Component: EmptyChatState
 * Muestra mensaje de bienvenida cuando no hay ticket seleccionado
 */

import { Box, Typography } from '@mui/joy'
import WhatsAppBackground from '../WhatsAppBackground'

export default function EmptyChatState() {
  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      <WhatsAppBackground />
      <Box sx={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <Box
          component="img"
          src="/chateam-logo.png"
          alt="Chateam"
          sx={{ width: 300, height: 'auto', mb: 2, opacity: 0.5 }}
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
        <Typography level="h4" sx={{ mb: 1, color: 'text.tertiary' }}>
          Selecciona un ticket para empezar a chatear
        </Typography>
      </Box>
    </Box>
  )
}
