import React, { lazy, Suspense, ComponentType } from 'react';
import { Box, CircularProgress, Typography } from '@mui/joy';

interface LazyComponentProps {
  component: () => Promise<{ default: ComponentType<any> }>;
  fallback?: React.ReactNode;
  errorFallback?: React.ReactNode;
  delay?: number;
}

/**
 * Wrapper para lazy loading de componentes React
 * Incluye loading state y error boundary
 */
const LazyComponent: React.FC<LazyComponentProps> = ({
  component,
  fallback,
  errorFallback,
  delay = 200
}) => {
  const LazyLoadedComponent = lazy(() => {
    // Agregar delay mínimo para evitar flash de loading
    return new Promise<{ default: ComponentType<any> }>(resolve => {
      setTimeout(() => {
        component().then(resolve);
      }, delay);
    });
  });

  const defaultFallback = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '200px',
        gap: 2
      }}
    >
      <CircularProgress />
      <Typography level="body-sm" color="neutral">
        Cargando módulo...
      </Typography>
    </Box>
  );

  const defaultErrorFallback = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '200px',
        gap: 2
      }}
    >
      <Typography level="h4" color="danger">
        Error al cargar módulo
      </Typography>
      <Typography level="body-sm" color="neutral">
        Por favor, recarga la página
      </Typography>
    </Box>
  );

  return (
    <Suspense fallback={fallback || defaultFallback}>
      <ErrorBoundary fallback={errorFallback || defaultErrorFallback}>
        <LazyLoadedComponent />
      </ErrorBoundary>
    </Suspense>
  );
};

// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('LazyComponent Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export default LazyComponent;

/**
 * HOC para crear lazy components fácilmente
 */
export function withLazy(
  importFunc: () => Promise<{ default: ComponentType<any> }>,
  options?: Omit<LazyComponentProps, 'component'>
) {
  return () => (
    <LazyComponent component={importFunc} {...options} />
  );
}
