/** Time and earnings per task, as bars. */

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useTheme } from '@mui/material/styles';
import { Box } from '@mui/material';
import { TaskTimeData, millisecondsToHours, formatTimeForChart } from '../../../utils/chartDataHelpers';
import { formatCurrency } from '../../../utils/formatters';
import { CHART_HEIGHT, ChartLegend, ChartTitle, ChartTooltipCard, ChartTooltipProps, hoveredPoint } from './ChartParts';

/** Longer names are cut on the axis; the tooltip shows them whole. */
const AXIS_NAME_LENGTH = 15;

interface TaskPoint {
  taskName: string;
  fullTaskName: string;
  timeHours: number;
  totalTime: number;
  earnings: number;
  entryCount: number;
}

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

export function TaskTimeBarChart({ data }: { data: TaskTimeData[] }) {
  const theme = useTheme();

  const text = theme.palette.text.primary;
  const time = theme.palette.primary.main;
  const earnings = theme.palette.secondary.main;
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
      <ChartTitle>Time Spent by Task</ChartTitle>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <BarChart data={points} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
          <XAxis
            dataKey="taskName"
            tick={{ fill: text, fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={80}
            interval={0}
          />
          <YAxis
            yAxisId="time"
            orientation="left"
            tick={{ fill: text, fontSize: 12 }}
            label={{ value: 'Hours', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: text } }}
          />
          <YAxis
            yAxisId="earnings"
            orientation="right"
            tick={{ fill: text, fontSize: 12 }}
            label={{
              value: 'Earnings ($)',
              angle: 90,
              position: 'insideRight',
              style: { textAnchor: 'middle', fill: text },
            }}
          />
          <Tooltip content={<TaskTimeTooltip />} />
          <Legend
            content={
              <ChartLegend
                shape="square"
                items={[
                  { label: 'Time (hours)', color: time },
                  { label: 'Earnings ($)', color: earnings },
                ]}
              />
            }
          />
          <Bar yAxisId="time" dataKey="timeHours" fill={time} name="Time (hours)" radius={[4, 4, 0, 0]} />
          <Bar yAxisId="earnings" dataKey="earnings" fill={earnings} name="Earnings ($)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
