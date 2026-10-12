/**
 * History charts: time and earnings by task, the task distribution, and a
 * daily / weekly / monthly timeline, over the filtered finished entries. A
 * collapsible card whose open state is remembered.
 */

import { Suspense, lazy, useMemo, useState } from 'react';
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
import { TimeEntry } from '../../../types/timer';
import { Task } from '../../../types/task';
import { useLocalStorage } from '../../../hooks/useLocalStorage';
import {
  aggregateByDay,
  aggregateByMonth,
  aggregateByTask,
  aggregateByWeek,
  prepareTaskDistributionData,
} from '../../../utils/chartDataHelpers';

// Lazy: the chart library is large and only needed here
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
  entries: TimeEntry[];
  tasks: Task[];
}

export function HistoryCharts({ entries, tasks }: HistoryChartsProps) {
  const [open, setOpen] = useLocalStorage<boolean>('historyChartsOpen', true);
  const [timelineView, setTimelineView] = useState<TimelineView>('daily');

  const chartData = useMemo(() => {
    if (!open) return null;
    const aggregateTimeline =
      timelineView === 'weekly' ? aggregateByWeek : timelineView === 'monthly' ? aggregateByMonth : aggregateByDay;
    return {
      taskTimeData: aggregateByTask(entries, tasks),
      taskDistributionData: prepareTaskDistributionData(entries),
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
            <InputLabel>Timeline View</InputLabel>
            <Select
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
                  <Paper variant="outlined" sx={{ p: 2, height: 450 }}>
                    <TaskTimeBarChart data={chartData.taskTimeData} showEarnings={true} height={400} />
                  </Paper>
                </Box>
                <Box sx={{ flex: { lg: 1 }, minWidth: 0 }}>
                  <Paper variant="outlined" sx={{ p: 2, height: 450 }}>
                    <TaskDistributionPieChart data={chartData.taskDistributionData} height={400} />
                  </Paper>
                </Box>
              </Box>
              <Paper variant="outlined" sx={{ p: 2, height: 450 }}>
                <TimelineChart
                  data={chartData.timelineData}
                  dataType={timelineView}
                  showEarnings={true}
                  height={400}
                />
              </Paper>
            </Stack>
          </Suspense>
        )}
      </Collapse>
    </Paper>
  );
}
