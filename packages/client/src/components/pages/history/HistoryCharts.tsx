/**
 * History charts: time and earnings by task, the task distribution, and a
 * daily / weekly / monthly timeline, over the filtered finished entries. A
 * collapsible card whose open state is remembered.
 */

import { Suspense, lazy, useId, useMemo, useState } from 'react';
import {
  Box,
  CircularProgress,
  Collapse,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { ExpandLess as ExpandLessIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import type { FinishedTimeEntry } from '../../../utils/csvExport';
import { Task } from '../../../types/task';
import { useLocalStorage } from '../../../hooks/useLocalStorage';
import { PHONE } from '../../../theme/media';
import {
  aggregateByDay,
  aggregateByMonth,
  aggregateByTask,
  aggregateByWeek,
  prepareTaskDistributionData,
} from '../../../utils/chartDataHelpers';

// Lazy: the chart library is large and only needed here
/** A chart's card: a set height on a desktop, as tall as the (smaller) chart on a phone. */
const CHART_CARD = { p: 2, height: 450, [PHONE]: { height: 'auto', p: 1.5 } } as const;

const TaskTimeBarChart = lazy(() =>
  import('../../ui/charts/TaskTimeBarChart').then(module => ({ default: module.TaskTimeBarChart }))
);
const TimelineChart = lazy(() =>
  import('../../ui/charts/TimelineChart').then(module => ({ default: module.TimelineChart }))
);
const TaskDistributionPieChart = lazy(() =>
  import('../../ui/charts/TaskDistributionPieChart').then(module => ({
    default: module.TaskDistributionPieChart,
  }))
);

type TimelineView = 'daily' | 'weekly' | 'monthly';

interface HistoryChartsProps {
  /** Finished entries only */
  entries: FinishedTimeEntry[];
  tasks: Task[];
}

export function HistoryCharts({ entries, tasks }: HistoryChartsProps) {
  const [open, setOpen] = useLocalStorage<boolean>('historyChartsOpen', true);
  const timelineLabelId = useId();
  const [timelineView, setTimelineView] = useState<TimelineView>('daily');

  const chartData = useMemo(() => {
    if (!open) return null;
    const aggregateTimeline =
      timelineView === 'weekly' ? aggregateByWeek : timelineView === 'monthly' ? aggregateByMonth : aggregateByDay;
    return {
      taskTimeData: aggregateByTask(entries, tasks),
      taskDistributionData: prepareTaskDistributionData(entries, tasks),
      timelineData: aggregateTimeline(entries, tasks),
    };
  }, [open, entries, tasks, timelineView]);

  if (entries.length === 0) return null;

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <IconButton
            size="small"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? 'Hide charts' : 'Show charts'}
          >
            {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Charts
          </Typography>
        </Stack>
        {open && (
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel id={timelineLabelId}>Timeline View</InputLabel>
            <Select
              labelId={timelineLabelId}
              value={timelineView}
              label="Timeline View"
              onChange={event => setTimelineView(event.target.value as TimelineView)}
            >
              <MenuItem value="daily">Daily</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
            </Select>
          </FormControl>
        )}
      </Stack>

      <Collapse in={open} unmountOnExit>
        {chartData && (
          <Suspense
            fallback={
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
                <CircularProgress />
              </Box>
            }
          >
            <Stack spacing={3} sx={{ mt: 3 }}>
              <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', lg: 'row' } }}>
                <Box sx={{ flex: { lg: 2 }, minWidth: 0 }}>
                  <Paper variant="outlined" sx={CHART_CARD}>
                    <TaskTimeBarChart data={chartData.taskTimeData} />
                  </Paper>
                </Box>
                <Box sx={{ flex: { lg: 1 }, minWidth: 0 }}>
                  <Paper variant="outlined" sx={CHART_CARD}>
                    <TaskDistributionPieChart data={chartData.taskDistributionData} />
                  </Paper>
                </Box>
              </Box>
              <Paper variant="outlined" sx={CHART_CARD}>
                <TimelineChart data={chartData.timelineData} dataType={timelineView} />
              </Paper>
            </Stack>
          </Suspense>
        )}
      </Collapse>
    </Paper>
  );
}
