/**
 * PageSkeleton — Skeleton loaders por tipo de pagina.
 * Mejora la percepcion de velocidad mientras carga el contenido.
 */
import type { JSX } from 'react';
import { Box, Card, Skeleton, Grid } from '@mui/joy';

type SkeletonVariant = 'dashboard' | 'table' | 'form' | 'cards' | 'generic';

interface PageSkeletonProps {
  variant?: SkeletonVariant;
}

function DashboardSkeleton() {
  return (
    <Box sx={{ p: 2 }}>
      {/* KPI cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[1, 2, 3, 4].map((i) => (
          <Grid key={i} xs={12} sm={6} md={3}>
            <Card variant="outlined" sx={{ p: 2 }}>
              <Skeleton variant="text" width="40%" sx={{ mb: 1 }} />
              <Skeleton variant="text" width="60%" level="h3" />
              <Skeleton variant="text" width="30%" sx={{ mt: 1 }} />
            </Card>
          </Grid>
        ))}
      </Grid>
      {/* Grafico */}
      <Card variant="outlined" sx={{ p: 2, height: 300 }}>
        <Skeleton variant="text" width="30%" sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={220} />
      </Card>
    </Box>
  );
}

function TableSkeleton() {
  return (
    <Box sx={{ p: 2 }}>
      <Skeleton variant="text" width="25%" level="h4" sx={{ mb: 2 }} />
      <Card variant="outlined" sx={{ p: 0, overflow: 'hidden' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', gap: 2, p: 1.5, bgcolor: 'background.level1' }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="text" width={`${20 + i * 5}%`} />
          ))}
        </Box>
        {/* Filas */}
        {[1, 2, 3, 4, 5].map((row) => (
          <Box key={row} sx={{ display: 'flex', gap: 2, p: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
            {[1, 2, 3, 4].map((col) => (
              <Skeleton key={col} variant="text" width={`${15 + col * 7}%`} />
            ))}
          </Box>
        ))}
      </Card>
    </Box>
  );
}

function FormSkeleton() {
  return (
    <Box sx={{ p: 2, maxWidth: 600 }}>
      <Skeleton variant="text" width="35%" level="h4" sx={{ mb: 3 }} />
      {[1, 2, 3, 4].map((i) => (
        <Box key={i} sx={{ mb: 2.5 }}>
          <Skeleton variant="text" width="20%" sx={{ mb: 0.5 }} />
          <Skeleton variant="rectangular" height={40} />
        </Box>
      ))}
      <Skeleton variant="rectangular" width={120} height={36} sx={{ mt: 2, borderRadius: 'sm' }} />
    </Box>
  );
}

function CardsSkeleton() {
  return (
    <Box sx={{ p: 2 }}>
      <Skeleton variant="text" width="25%" level="h4" sx={{ mb: 2 }} />
      <Grid container spacing={2}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Grid key={i} xs={12} sm={6} md={4}>
            <Card variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
              <Skeleton variant="circular" width={64} height={64} sx={{ mx: 'auto', mb: 1.5 }} />
              <Skeleton variant="text" width="60%" sx={{ mx: 'auto', mb: 0.5 }} />
              <Skeleton variant="text" width="40%" sx={{ mx: 'auto', mb: 1.5 }} />
              <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                <Skeleton variant="rectangular" width={50} height={20} sx={{ borderRadius: 'sm' }} />
                <Skeleton variant="rectangular" width={50} height={20} sx={{ borderRadius: 'sm' }} />
              </Box>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

function GenericSkeleton() {
  return (
    <Box sx={{ p: 2 }}>
      <Skeleton variant="text" width="30%" level="h4" sx={{ mb: 2 }} />
      <Skeleton variant="text" width="80%" sx={{ mb: 1 }} />
      <Skeleton variant="text" width="65%" sx={{ mb: 1 }} />
      <Skeleton variant="text" width="70%" sx={{ mb: 3 }} />
      <Skeleton variant="rectangular" height={200} />
    </Box>
  );
}

const VARIANTS: Record<SkeletonVariant, () => JSX.Element> = {
  dashboard: DashboardSkeleton,
  table: TableSkeleton,
  form: FormSkeleton,
  cards: CardsSkeleton,
  generic: GenericSkeleton,
};

export default function PageSkeleton({ variant = 'generic' }: PageSkeletonProps) {
  const Component = VARIANTS[variant];
  return <Component />;
}
