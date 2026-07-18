import React, { useEffect, useRef, useCallback } from 'react';
import { Box, CircularProgress, Typography } from '@mui/joy';

interface InfiniteScrollProps {
  children: React.ReactNode;
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  threshold?: number;
  loader?: React.ReactNode;
  endMessage?: React.ReactNode;
}

/**
 * Componente InfiniteScroll con Intersection Observer
 * Carga más datos automáticamente al llegar al final
 */
const InfiniteScroll: React.FC<InfiniteScrollProps> = ({
  children,
  hasMore,
  isLoading,
  onLoadMore,
  threshold = 100,
  loader,
  endMessage
}) => {
  const observerTarget = useRef<HTMLDivElement>(null);

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasMore && !isLoading) {
        onLoadMore();
      }
    },
    [hasMore, isLoading, onLoadMore]
  );

  useEffect(() => {
    const observer = new IntersectionObserver(handleIntersection, {
      root: null,
      rootMargin: `${threshold}px`,
      threshold: 0.1
    });

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [handleIntersection, threshold]);

  const defaultLoader = (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 3
      }}
    >
      <CircularProgress size="sm" />
      <Typography level="body-sm" sx={{ ml: 2 }}>
        Cargando más...
      </Typography>
    </Box>
  );

  const defaultEndMessage = (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        padding: 3
      }}
    >
      <Typography level="body-sm" color="neutral">
        No hay más elementos para mostrar
      </Typography>
    </Box>
  );

  return (
    <Box>
      {children}

      {/* Loader mientras carga */}
      {isLoading && (loader || defaultLoader)}

      {/* Mensaje de fin si no hay más elementos */}
      {!hasMore && !isLoading && (endMessage || defaultEndMessage)}

      {/* Target del Intersection Observer */}
      {hasMore && !isLoading && (
        <div ref={observerTarget} style={{ height: '1px' }} />
      )}
    </Box>
  );
};

export default InfiniteScroll;

/**
 * Hook personalizado para manejar infinite scroll
 */
export function useInfiniteScroll<T>(
  fetchFunction: (page: number) => Promise<{ data: T[]; hasMore: boolean }>,
  initialPage = 1
) {
  const [data, setData] = React.useState<T[]>([]);
  const [page, setPage] = React.useState(initialPage);
  const [hasMore, setHasMore] = React.useState(true);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchFunction(page);
      setData(prev => [...prev, ...result.data]);
      setHasMore(result.hasMore);
      setPage(prev => prev + 1);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [page, fetchFunction, isLoading, hasMore]);

  const reset = useCallback(() => {
    setData([]);
    setPage(initialPage);
    setHasMore(true);
    setError(null);
  }, [initialPage]);

  return {
    data,
    hasMore,
    isLoading,
    error,
    loadMore,
    reset
  };
}
