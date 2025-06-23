// import React from 'react'; // Commented out unused import
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import { useTheme } from '@mui/material/styles';
import { Box, Typography } from '@mui/material';
import { generateChartColors, formatTimeForChart } from '../../../utils/chartDataHelpers';

interface TaskDistributionData {
  name: string;
  value: number; // hours
  percentage: number;
}

interface TaskDistributionPieChartProps {
  data: TaskDistributionData[];
  height?: number;
  title?: string;
  showPercentages?: boolean;
}

export function TaskDistributionPieChart({
  data,
  height = 400,
  title = 'Task Time Distribution',
  showPercentages = true,
}: TaskDistributionPieChartProps) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // Generate colors for pie slices
  const colors = generateChartColors(data.length);

  // Prepare data with colors
  const chartData = data.map((item, index) => ({
    ...item,
    color: colors[index],
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <Box
          sx={{
            backgroundColor: isDarkMode ? '#333333' : '#ffffff',
            border: `1px solid ${isDarkMode ? '#555555' : '#cccccc'}`,
            borderRadius: 1,
            p: 2,
            boxShadow: 2,
          }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            {data.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Time: {formatTimeForChart(data.value * 1000 * 60 * 60)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Percentage: {data.percentage.toFixed(1)}%
          </Typography>
        </Box>
      );
    }
    return null;
  };

  const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (!showPercentages || percent < 0.05) return null; // Don't show labels for slices < 5%
    
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill={isDarkMode ? '#ffffff' : '#000000'}
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={12}
        fontWeight={500}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const CustomLegend = ({ payload }: any) => {
    if (!payload || payload.length === 0) return null;
    
    return (
      <Box sx={{ mt: 2 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 1,
            maxHeight: 120,
            overflowY: 'auto',
          }}
        >
          {payload.map((entry: any, index: number) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 0.5,
              }}
            >
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  backgroundColor: entry.color,
                  borderRadius: '50%',
                  flexShrink: 0,
                }}
              />
              <Typography
                variant="caption"
                sx={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
                title={entry.value}
              >
                {entry.value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    );
  };

  if (data.length === 0) {
    return (
      <Box
        sx={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.secondary',
        }}
      >
        <Typography variant="body1">No data available</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, textAlign: 'center' }}>
        {title}
      </Typography>
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={CustomLabel}
            outerRadius={Math.min(height * 0.3, 120)}
            fill="#8884d8"
            dataKey="value"
            stroke={isDarkMode ? '#333333' : '#ffffff'}
            strokeWidth={2}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
        </PieChart>
      </ResponsiveContainer>
    </Box>
  );
}
