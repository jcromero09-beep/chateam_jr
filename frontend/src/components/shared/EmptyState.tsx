/**
 * EmptyState — Componente para mostrar cuando una lista/seccion esta vacia.
 * Patron visual consistente en toda la aplicacion.
 */
import type { ReactNode } from 'react';
import { Box, Button, Sheet, Typography } from '@mui/joy';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  /** Icono grande centrado (default: Inbox) */
  icon?: ReactNode;
  /** Titulo principal ej: "No hay contactos" */
  title: string;
  /** Descripcion adicional */
  description?: string;
  /** Texto del boton de accion */
  actionLabel?: string;
  /** Handler del boton */
  onAction?: () => void;
  /** Icono del boton */
  actionIcon?: ReactNode;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon,
}: EmptyStateProps) {
  return (
    <Sheet
      variant="soft"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        py: 6,
        px: 3,
        borderRadius: 'lg',
        minHeight: 280,
      }}
    >
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          bgcolor: 'background.surface',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          mb: 2,
          color: 'text.tertiary',
        }}
      >
        {icon ?? <Inbox size={32} />}
      </Box>

      <Typography level="title-lg" sx={{ mb: 0.5 }}>
        {title}
      </Typography>

      {description && (
        <Typography level="body-sm" sx={{ color: 'text.tertiary', maxWidth: 360, mb: actionLabel ? 2.5 : 0 }}>
          {description}
        </Typography>
      )}

      {actionLabel && onAction && (
        <Button
          variant="solid"
          size="sm"
          onClick={onAction}
          startDecorator={actionIcon}
        >
          {actionLabel}
        </Button>
      )}
    </Sheet>
  );
}
