/**
 * UnderConstruction — Placeholder para paginas en desarrollo.
 * Reemplaza los stubs con texto plano por un diseno consistente.
 */
import { Box, Sheet, Typography } from '@mui/joy';
import { Construction } from 'lucide-react';

interface UnderConstructionProps {
  /** Nombre de la pagina/modulo */
  title?: string;
  /** Descripcion adicional */
  description?: string;
}

export default function UnderConstruction({
  title = 'Pagina en desarrollo',
  description = 'Esta funcionalidad estara disponible proximamente. Estamos trabajando para ofrecerte la mejor experiencia.',
}: UnderConstructionProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', p: 3 }}>
      <Sheet
        variant="soft"
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          p: 5,
          borderRadius: 'lg',
          maxWidth: 480,
        }}
      >
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            bgcolor: 'warning.100',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 2.5,
            color: 'warning.600',
          }}
        >
          <Construction size={36} />
        </Box>

        <Typography level="h4" sx={{ mb: 1 }}>
          {title}
        </Typography>

        <Typography level="body-md" sx={{ color: 'text.secondary', maxWidth: 360 }}>
          {description}
        </Typography>
      </Sheet>
    </Box>
  );
}
