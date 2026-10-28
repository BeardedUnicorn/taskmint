/** Time and earnings over days, weeks or months, as lines. */

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useTheme } from '@mui/material/styles';
import { Box } from '@mui/material';
import { DailyData, WeeklyData, MonthlyData, millisecondsToHours, formatTimeForChart } from '../../../utils/chartDataHelpers';
import { formatCurrency } from '../../../utils/formatters';
import { formatShortDate } from '../../../utils/locale';
import {
  CHART_HEIGHT,
  ChartLegend,
  ChartTitle,
  ChartTooltipCard,
  ChartTooltipProps,
  hoveredPoint,
} from './ChartParts';

type TimelineData = DailyData | WeeklyData | MonthlyData;
export type TimelineType = 'daily' | 'weekly' | 'monthly';

const TITLES: Record<TimelineType, string> = {
  daily: 'Daily Time Tracking Trends',
  weekly: 'Weekly Time Tracking Trends',
  monthly: 'Monthly Time Tracking Trends',
};

/** The period a point covers: its day, week or month key. */
function periodOf(item: TimelineData): string {
  if ('date' in item) return item.date;
  if ('week' in item) return item.week;
  return item.month;
}

interface PeriodPoint {
  period: string;
  timeHours: number;
  totalTime: number;
  earnings: number;
  entryCount: number;
}

export function TimelineTooltip(props: ChartTooltipProps<PeriodPoint>) {
  const point = hoveredPoint(props);
  if (!point) return null;
  return (
    <ChartTooltipCard
      title={String(props.label)}
      lines={[
        `Time: ${formatTimeForChart(point.totalTime)}`,
        `Earnings: ${formatCurrency(point.earnings)}`,
        `Entries: ${point.entryCount}`,
      ]}
    />
  );
}

export function TimelineChart({ data, dataType }: { data: TimelineData[]; dataType: TimelineType }) {
  const theme = useTheme();

  const text = theme.palette.text.primary;
  const time = theme.palette.primary.main;
  const earnings = theme.palette.secondary.main;
  const points: PeriodPoint[] = data.map(item => ({
    period: periodOf(item),
    timeHours: millisecondsToHours(item.totalTime),
    totalTime: item.totalTime,
    earnings: item.totalEarnings,
    entryCount: item.entryCount,
  }));
  // Days show as dates; week and month keys show as they are
  const formatPeriod = (period: string) => (dataType === 'daily' ? formatShortDate(period) : period);

  return (
    <Box>
      <ChartTitle>{TITLES[dataType]}</ChartTitle>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={points} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
          <XAxis dataKey="period" tick={{ fill: text, fontSize: 12 }} tickFormatter={formatPeriod} />
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
            label={{ value: 'Earnings ($)', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fill: text } }}
          />
          <Tooltip content={<TimelineTooltip />} />
          <Legend
            content={
              <ChartLegend
                shape="line"
                items={[
                  { label: 'Time (hours)', color: time },
                  { label: 'Earnings ($)', color: earnings },
                ]}
              />
            }
          />
          <Line
            yAxisId="time"
            type="monotone"
            dataKey="timeHours"
            stroke={time}
            strokeWidth={3}
            dot={{ fill: time, strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, stroke: time, strokeWidth: 2 }}
            name="Time (hours)"
          />
          <Line
            yAxisId="earnings"
            type="monotone"
            dataKey="earnings"
            stroke={earnings}
            strokeWidth={3}
            dot={{ fill: earnings, strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, stroke: earnings, strokeWidth: 2 }}
            name="Earnings ($)"
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
