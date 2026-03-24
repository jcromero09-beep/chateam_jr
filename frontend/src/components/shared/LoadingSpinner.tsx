/**
 * LoadingSpinner — Componente reutilizable de carga.
 * Reemplaza todos los <div>Cargando...</div> del proyecto.
 */
import { Box, CircularProgress, Typography } from '@mui/joy';

interface LoadingSpinnerProps {
  /** Tamano del spinner */
  size?: 'sm' | 'md' | 'lg';
  /** Mensaje debajo del spinner */
  message?: string;
  /** Si true, centra vertical y horizontalmente en toda la pagina */
  fullPage?: boolean;
}

const SIZE_MAP = { sm: 24, md: 36, lg: 48 };

export default function LoadingSpinner({
  size = 'md',
  message = 'Cargando...',
  fullPage = false,
}: LoadingSpinnerProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.5,
        py: fullPage ? 0 : 4,
        ...(fullPage && {
          minHeight: '60vh',
          width: '100%',
        }),
      }}
    >
      <CircularProgress size={size} sx={{ '--CircularProgress-size': `${SIZE_MAP[size]}px` }} />
      {message && (
        <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
          {message}
        </Typography>
      )}
    </Box>
  );
}
