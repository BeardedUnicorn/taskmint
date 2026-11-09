/** Each task's share of the time, as a pie. */

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, type PieLabelRenderProps } from 'recharts';
import { useTheme } from '@mui/material/styles';
import { Box } from '@mui/material';
import { generateChartColors, formatTimeForChart } from '../../../utils/chartDataHelpers';
import {
  ChartLegend,
  useChartLayout,
  ChartTitle,
  ChartTooltipCard,
  ChartTooltipProps,
  hoveredPoint,
} from './ChartParts';

interface TaskShare {
  name: string;
  /** Hours */
  value: number;
  percentage: number;
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

  const colors = generateChartColors(data.length);
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
            data={data}
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
            {data.map((share, index) => (
              <Cell key={share.name} fill={colors[index]} />
            ))}
          </Pie>
          <Tooltip content={<TaskShareTooltip />} />
          <Legend
            content={
              <ChartLegend
                shape="dot"
                items={data.map((share, index) => ({ label: share.name, color: colors[index] }))}
              />
            }
          />
        </PieChart>
      </ResponsiveContainer>
    </Box>
  );
}
