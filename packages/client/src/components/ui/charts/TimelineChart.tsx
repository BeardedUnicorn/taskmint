/** Time or earnings over days, weeks or months, as a line. */

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTheme } from '@mui/material/styles';
import { Box } from '@mui/material';
import {
  DailyData,
  WeeklyData,
  MonthlyData,
  millisecondsToHours,
  formatTimeForChart,
} from '../../../utils/chartDataHelpers';
import { parseDateStringLocal } from '../../../utils/dateHelpers';
import { formatCurrency } from '../../../utils/formatters';
import { formatShortDate } from '../../../utils/locale';
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

type TimelineData = DailyData | WeeklyData | MonthlyData;
export type TimelineType = 'daily' | 'weekly' | 'monthly';

const PERIODS: Record<TimelineType, string> = { daily: 'day', weekly: 'week', monthly: 'month' };

/** "Time per day", "Earnings per week"… */
const titleOf = (measure: ChartMeasure, dataType: TimelineType) =>
  `${MEASURES[measure].label} per ${PERIODS[dataType]}`;

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

export function TimelineChart({
  data,
  dataType,
  measure,
}: {
  data: TimelineData[];
  dataType: TimelineType;
  measure: ChartMeasure;
}) {
  const theme = useTheme();
  const layout = useChartLayout();
  const color = useSeriesColor();
  const { dataKey, tick, axisTitle } = MEASURES[measure];

  const text = theme.palette.text.primary;
  const points: PeriodPoint[] = data.map(item => ({
    period: periodOf(item),
    timeHours: millisecondsToHours(item.totalTime),
    totalTime: item.totalTime,
    earnings: item.totalEarnings,
    entryCount: item.entryCount,
  }));
  // Days show as dates (local ones: read directly, a YYYY-MM-DD is UTC midnight,
  // the day before west of UTC); week and month keys show as they are
  const formatPeriod = (period: string) =>
    dataType === 'daily' ? formatShortDate(parseDateStringLocal(period)) : period;

  return (
    <Box>
      <ChartTitle>{titleOf(measure, dataType)}</ChartTitle>
      <ResponsiveContainer width="100%" height={layout.height}>
        <LineChart data={points} margin={{ top: 20, ...layout.sideMargin, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} vertical={false} />
          <XAxis dataKey="period" tick={{ fill: text, fontSize: layout.tickFontSize }} tickFormatter={formatPeriod} />
          <YAxis
            width={layout.axisWidth}
            tick={{ fill: text, fontSize: layout.tickFontSize }}
            tickFormatter={tick}
            label={
              layout.axisTitles
                ? { value: axisTitle, angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: text } }
                : undefined
            }
          />
          <Tooltip content={<TimelineTooltip />} />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={{ fill: color, stroke: theme.palette.background.paper, strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, fill: color, stroke: theme.palette.background.paper, strokeWidth: 2 }}
            name={axisTitle}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
