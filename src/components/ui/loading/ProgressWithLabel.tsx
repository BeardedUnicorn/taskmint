import { Box, LinearProgress, Typography } from '@mui/material';

export interface ProgressWithLabelProps {
  progress: number;
  color?: 'primary' | 'secondary' | 'inherit';
  width?: number | string;
  maxWidth?: number | string;
}

export function ProgressWithLabel({ progress, color = 'primary', width = '100%', maxWidth }: ProgressWithLabelProps) {
  return (
    <Box sx={{ width, ...(maxWidth !== undefined ? { maxWidth } : {}) }}>
      <LinearProgress
        variant="determinate"
        value={progress}
        color={color}
        sx={{ height: 8, borderRadius: 4 }}
      />
      <Typography variant="body2" sx={{ mt: 1, textAlign: 'center' }}>
        {Math.round(progress)}%
      </Typography>
    </Box>
  );
}

export default ProgressWithLabel;
