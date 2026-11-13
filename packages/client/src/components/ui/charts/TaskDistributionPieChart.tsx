/**
 * Each task's share of the time, as a pie. The five biggest tasks get a
 * slice of their own and the rest share Other. A task's colour follows the
 * task (by name among those shown), not its size, so it doesn't swap colour
 * with another when their shares change places.
 */

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, type PieLabelRenderProps } from 'recharts';
import { useTheme } from '@mui/material/styles';
import { Box } from '@mui/material';
import { formatTimeForChart } from '../../../utils/chartDataHelpers';
import {
  CATEGORICAL,
  ChartLegend,
  useChartLayout,
  ChartTitle,
  ChartTooltipCard,
  ChartTooltipProps,
  OTHER_COLOR,
  hoveredPoint,
} from './ChartParts';

interface TaskShare {
  name: string;
  /** Hours */
  value: number;
  percentage: number;
}

export const OTHER = 'Other';

/** The biggest shares (biggest first) with a slice each, the rest summed into Other. */
export function foldShares(data: TaskShare[], slices: number): TaskShare[] {
  if (data.length <= slices) return data;
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const kept = sorted.slice(0, slices - 1);
  const rest = sorted.slice(slices - 1);
  return [
    ...kept,
    {
      name: OTHER,
      value: rest.reduce((sum, share) => sum + share.value, 0),
      percentage: rest.reduce((sum, share) => sum + share.percentage, 0),
    },
  ];
}

/** Slices smaller than this carry no percentage label (it wouldn't fit). */
const MIN_LABELED_SHARE = 0.05;

export function TaskShareTooltip(props: ChartTooltipProps<TaskShare>) {
  const share = hoveredPoint(props);
  if (!share) return null;
  return (
    <ChartTooltipCard
      title={share.name}
      lines={[
        `Time: ${formatTimeForChart(share.value * 60 * 60 * 1000)}`,
        `Percentage: ${share.percentage.toFixed(1)}%`,
      ]}
    />
  );
}

interface SliceLabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
}

export function TaskDistributionPieChart({ data }: { data: TaskShare[] }) {
  const theme = useTheme();
  const layout = useChartLayout();

  const { mode } = theme.palette;
  const palette = CATEGORICAL[mode];
  const shares = foldShares(data, palette.length);
  // Colours by name, so a task keeps its colour whatever its rank
  const byName = shares
    .map(share => share.name)
    .filter(name => name !== OTHER)
    .sort((a, b) => a.localeCompare(b));
  const colorOf = (name: string) => (name === OTHER ? OTHER_COLOR[mode] : palette[byName.indexOf(name)]);
  const SliceLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: SliceLabelProps) => {
    if (percent < MIN_LABELED_SHARE) return null;
    const radians = (-midAngle * Math.PI) / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(radians);
    const y = cy + radius * Math.sin(radians);
    return (
      <text
        x={x}
        y={y}
        fill={theme.palette.text.primary}
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={12}
        fontWeight={500}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <Box>
      <ChartTitle>Task Time Distribution</ChartTitle>
      <ResponsiveContainer width="100%" height={layout.height}>
        <PieChart>
          <Pie
            data={shares}
            cx="50%"
            cy="50%"
            labelLine={false}
            // A rendered slice's label always gets its geometry (typed optional)
            label={(props: PieLabelRenderProps) => SliceLabel(props as SliceLabelProps)}
            outerRadius={layout.pieRadius}
            dataKey="value"
            stroke={theme.palette.background.paper}
            strokeWidth={2}
          >
            {shares.map(share => (
              <Cell key={share.name} fill={colorOf(share.name)} />
            ))}
          </Pie>
          <Tooltip content={<TaskShareTooltip />} />
          <Legend
            content={
              <ChartLegend
                shape="dot"
                items={shares.map(share => ({ label: share.name, color: colorOf(share.name) }))}
              />
            }
          />
        </PieChart>
      </ResponsiveContainer>
    </Box>
  );
}
