import { ReactNode } from 'react';
import { Box, Skeleton } from '@mui/material';

export interface SkeletonLoaderProps {
  loading: boolean;
  children: ReactNode;
  variant?: 'text' | 'rectangular' | 'circular';
  width?: number | string;
  height?: number | string;
  count?: number;
  animation?: 'pulse' | 'wave' | false;
}

export function SkeletonLoader({
  loading,
  children,
  variant = 'rectangular',
  width = '100%',
  height = 40,
  count = 1,
  animation = 'wave',
}: SkeletonLoaderProps) {
  if (!loading) {
    return <>{children}</>;
  }

  return (
    <Box>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton
          key={index}
          variant={variant}
          width={width}
          height={height}
          animation={animation}
          sx={{ mb: count > 1 ? 1 : 0 }}
        />
      ))}
    </Box>
  );
}

export default SkeletonLoader;
