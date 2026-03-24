/**
 * ErrorBoundary — Captura errores de renderizado React.
 * Muestra UI amigable con boton de recargar.
 */
import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { Box, Button, Sheet, Typography } from '@mui/joy';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Fallback personalizado en lugar del default */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', p: 3 }}>
          <Sheet
            variant="outlined"
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              p: 4,
              borderRadius: 'lg',
              maxWidth: 420,
            }}
          >
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: 'danger.100',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 2,
                color: 'danger.600',
              }}
            >
              <AlertTriangle size={28} />
            </Box>

            <Typography level="title-lg" sx={{ mb: 0.5 }}>
              Algo salio mal
            </Typography>
            <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 3 }}>
              Ocurrio un error inesperado. Puedes intentar recargar la pagina.
            </Typography>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="soft" color="neutral" size="sm" onClick={this.handleRetry}>
                Reintentar
              </Button>
              <Button variant="solid" size="sm" startDecorator={<RefreshCw size={16} />} onClick={this.handleReload}>
                Recargar pagina
              </Button>
            </Box>
          </Sheet>
        </Box>
      );
    }

    return this.props.children;
  }
}
