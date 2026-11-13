/** Time or earnings per task, as bars: standing up on a desktop, running across on a phone. */

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTheme } from '@mui/material/styles';
import { Box } from '@mui/material';
import { TaskTimeData, millisecondsToHours, formatTimeForChart } from '../../../utils/chartDataHelpers';
import { formatCurrency } from '../../../utils/formatters';
import {
  ChartMeasure,
  ChartTitle,
  ChartTooltipCard,
  ChartTooltipProps,
  MEASURES,
  hoveredPoint,
  useChartLayout,
  useSeriesColor,
} from './ChartParts';

/** Longer names are cut on the axis; the tooltip shows them whole. */
const AXIS_NAME_LENGTH = 15;
/** A bar running across, with the room around it. */
const ROW_HEIGHT = 44;

interface TaskPoint {
  taskName: string;
  fullTaskName: string;
  timeHours: number;
  totalTime: number;
  earnings: number;
  entryCount: number;
}

const TITLES: Record<ChartMeasure, string> = { time: 'Time by Task', earnings: 'Earnings by Task' };

export function TaskTimeTooltip(props: ChartTooltipProps<TaskPoint>) {
  const point = hoveredPoint(props);
  if (!point) return null;
  return (
    <ChartTooltipCard
      title={point.fullTaskName}
      lines={[
        `Time: ${formatTimeForChart(point.totalTime)}`,
        `Earnings: ${formatCurrency(point.earnings)}`,
        `Entries: ${point.entryCount}`,
      ]}
    />
  );
}

export function TaskTimeBarChart({ data, measure }: { data: TaskTimeData[]; measure: ChartMeasure }) {
  const theme = useTheme();
  const layout = useChartLayout();
  const color = useSeriesColor();
  const { dataKey, tick, axisTitle } = MEASURES[measure];

  const text = theme.palette.text.primary;
  const ticks = { fill: text, fontSize: layout.tickFontSize };
  const points: TaskPoint[] = data.map(item => ({
    taskName:
      item.taskName.length > AXIS_NAME_LENGTH ? `${item.taskName.substring(0, AXIS_NAME_LENGTH)}...` : item.taskName,
    fullTaskName: item.taskName,
    timeHours: millisecondsToHours(item.totalTime),
    totalTime: item.totalTime,
    earnings: item.totalEarnings,
    entryCount: item.entryCount,
  }));

  return (
    <Box>
      <ChartTitle>{TITLES[measure]}</ChartTitle>
      {layout.barsAcross ? (
        <ResponsiveContainer width="100%" height={points.length * ROW_HEIGHT + 40}>
          <BarChart data={points} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} horizontal={false} />
            <XAxis type="number" tick={ticks} tickFormatter={tick} />
            <YAxis type="category" dataKey="taskName" width={104} tick={ticks} interval={0} />
            <Tooltip content={<TaskTimeTooltip />} cursor={{ fill: theme.palette.action.hover }} />
            <Bar dataKey={dataKey} fill={color} name={axisTitle} radius={[0, 4, 4, 0]} barSize={20} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ResponsiveContainer width="100%" height={layout.height}>
          <BarChart data={points} margin={{ top: 20, ...layout.sideMargin, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
            <XAxis dataKey="taskName" tick={ticks} angle={-45} textAnchor="end" height={80} interval={0} />
            <YAxis
              width={layout.axisWidth}
              tick={ticks}
              tickFormatter={tick}
              label={{
                value: axisTitle,
                angle: -90,
                position: 'insideLeft',
                style: { textAnchor: 'middle', fill: text },
              }}
            />
            <Tooltip content={<TaskTimeTooltip />} cursor={{ fill: theme.palette.action.hover }} />
            <Bar dataKey={dataKey} fill={color} name={axisTitle} radius={[4, 4, 0, 0]} maxBarSize={56} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Box>
  );
}
