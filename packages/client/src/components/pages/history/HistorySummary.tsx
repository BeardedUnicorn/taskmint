/**
 * History summary: total time, earnings, entries and tasks over the filtered
 * finished entries (earnings at the rate each was tracked at).
 */

import { useMemo } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { TimeEntry } from '../../../types/timer';
import { Task } from '../../../types/task';
import { EarningsDisplay } from '../../ui/display/EarningsDisplay';
import { entryEarnings } from '../../../utils/earnings';
import { formatDuration } from '../../../utils/formatters';

interface HistorySummaryProps {
  /** Finished entries only */
  entries: TimeEntry[];
  tasks: Task[];
}

export function HistorySummary({ entries, tasks }: HistorySummaryProps) {
  const stats = useMemo(
    () => ({
      totalDuration: entries.reduce((total, entry) => total + (entry.duration || 0), 0),
      totalEarnings: entries.reduce((total, entry) => total + entryEarnings(entry, tasks), 0),
      entryCount: entries.length,
      taskCount: new Set(entries.map(entry => entry.taskName)).size,
    }),
    [entries, tasks]
  );

  return (
    <Paper sx={{ p: 3, mb: 3 }} aria-label="Summary">
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={4}>
        <Box>
          <Typography variant="body2" color="text.secondary">
            Total time
          </Typography>
          <Typography variant="h6" color="primary">
            {formatDuration(stats.totalDuration)}
          </Typography>
        </Box>
        <Box>
          <Typography variant="body2" color="text.secondary">
            Earnings
          </Typography>
          <EarningsDisplay amount={stats.totalEarnings} variant="h6" />
        </Box>
        <Box>
          <Typography variant="body2" color="text.secondary">
            Entries
          </Typography>
          <Typography variant="h6" color="info.main">
            {stats.entryCount}
          </Typography>
        </Box>
        <Box>
          <Typography variant="body2" color="text.secondary">
            Tasks worked on
          </Typography>
          <Typography variant="h6" color="secondary.main">
            {stats.taskCount}
          </Typography>
        </Box>
      </Stack>
    </Paper>
  );
}
