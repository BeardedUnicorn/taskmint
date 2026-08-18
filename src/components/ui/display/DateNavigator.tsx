
import { Box, Stack } from '@mui/material';
import { DateNavigatorProps } from '../../../types/ui';
import { NavigationButton } from '../buttons/NavigationButton';
import dayjs from 'dayjs';

/**
 * Date navigation component with prev/next/today controls
 * Provides consistent date navigation across different views
 */
export function DateNavigator({
  selectedDate,
  onDateChange,
  onPrevious,
  onNext,
  onToday,
  format = 'MMM DD',
  sx,
}: DateNavigatorProps) {
  const formattedDate = dayjs(selectedDate).format(format);

  const handleTodayClick = () => {
    const today = new Date();
    onDateChange(today);
    onToday();
  };

  return (
    <Box sx={sx}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <NavigationButton
          direction="prev"
          onClick={onPrevious}
        />
        
        <NavigationButton
          direction="today"
          onClick={handleTodayClick}
          label={formattedDate}
        />
        
        <NavigationButton
          direction="next"
          onClick={onNext}
        />
      </Stack>
    </Box>
  );
}
