/**
 * Componente: CreditBalanceDisplay
 * Muestra el balance de créditos para generación de imágenes
 */

import { Box, Card, CardContent, Typography, Chip, Skeleton } from '@mui/joy';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';

interface CreditBalanceDisplayProps {
  balance: number;
  totalUsed?: number;
  loading?: boolean;
  compact?: boolean;
}

export default function CreditBalanceDisplay({
  balance,
  totalUsed = 0,
  loading = false,
  compact = false
}: CreditBalanceDisplayProps) {
  // Formatear número con separador de miles
  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('es-ES').format(num);
  };

  // Determinar color según balance
  const getBalanceColor = (): 'success' | 'warning' | 'danger' => {
    if (balance >= 100) return 'success';
    if (balance >= 20) return 'warning';
    return 'danger';
  };

  // Versión compacta (para usar en headers o sidebars)
  if (compact) {
    if (loading) {
      return <Skeleton variant="rectangular" width={120} height={32} />;
    }

    return (
      <Chip
        variant="soft"
        color={getBalanceColor()}
        startDecorator={<AutoAwesomeIcon sx={{ fontSize: 16 }} />}
        sx={{ fontWeight: 'bold' }}
      >
        {formatNumber(balance)} créditos
      </Chip>
    );
  }

  // Versión completa (card)
  return (
    <Card
      variant="soft"
      color={getBalanceColor()}
      sx={{
        minWidth: 200,
        background: balance >= 100
          ? 'linear-gradient(135deg, rgba(37, 211, 102, 0.1) 0%, rgba(37, 211, 102, 0.05) 100%)'
          : balance >= 20
            ? 'linear-gradient(135deg, rgba(255, 193, 7, 0.1) 0%, rgba(255, 193, 7, 0.05) 100%)'
            : 'linear-gradient(135deg, rgba(211, 47, 47, 0.1) 0%, rgba(211, 47, 47, 0.05) 100%)'
      }}
    >
      <CardContent>
        {loading ? (
          <>
            <Skeleton variant="text" width={100} height={20} />
            <Skeleton variant="text" width={80} height={36} />
            <Skeleton variant="text" width={120} height={16} />
          </>
        ) : (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <AutoAwesomeIcon
                sx={{
                  fontSize: 20,
                  color: getBalanceColor() === 'success'
                    ? 'success.500'
                    : getBalanceColor() === 'warning'
                      ? 'warning.500'
                      : 'danger.500'
                }}
              />
              <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                Créditos Disponibles
              </Typography>
            </Box>

            <Typography
              level="h2"
              sx={{
                color: getBalanceColor() === 'success'
                  ? 'success.600'
                  : getBalanceColor() === 'warning'
                    ? 'warning.600'
                    : 'danger.600',
                fontWeight: 'bold'
              }}
            >
              {formatNumber(balance)}
            </Typography>

            {totalUsed > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
                <TrendingDownIcon sx={{ fontSize: 14, color: 'text.tertiary' }} />
                <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                  {formatNumber(totalUsed)} créditos usados en total
                </Typography>
              </Box>
            )}

            {balance < 20 && (
              <Typography
                level="body-xs"
                sx={{ color: 'danger.500', mt: 1, fontWeight: 'medium' }}
              >
                Balance bajo - Considera recargar créditos
              </Typography>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
