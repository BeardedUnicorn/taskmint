// import React from 'react'; // Commented out unused import
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useTheme } from '@mui/material/styles';
import { Box, Typography } from '@mui/material';
import { DailyData, WeeklyData, MonthlyData, millisecondsToHours, formatTimeForChart } from '../../../utils/chartDataHelpers';
import { formatCurrency } from '../../../utils/formatters';

type TimelineData = DailyData | WeeklyData | MonthlyData;

interface TimelineChartProps {
  data: TimelineData[];
  dataType: 'daily' | 'weekly' | 'monthly';
  showEarnings?: boolean;
  height?: number;
  title?: string;
}

export function TimelineChart({
  data,
  dataType,
  showEarnings = true,
  height = 400,
  title,
}: TimelineChartProps) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // Prepare data for chart
  const chartData = data.map(item => {
    const dateKey = dataType === 'daily' ? 'date' : dataType === 'weekly' ? 'week' : 'month';
    return {
      period: (item as any)[dateKey],
      timeHours: millisecondsToHours(item.totalTime),
      earnings: item.totalEarnings,
      entryCount: item.entryCount,
    };
  });

  const getDefaultTitle = () => {
    const timeType = dataType === 'daily' ? 'Daily' : dataType === 'weekly' ? 'Weekly' : 'Monthly';
    return `${timeType} Time Tracking Trends`;
  };

  const formatPeriodLabel = (period: string) => {
    if (dataType === 'daily') {
      return new Date(period).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return period;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
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
            {label}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Time: {formatTimeForChart(data.timeHours * 1000 * 60 * 60)}
          </Typography>
          {showEarnings && (
            <Typography variant="body2" color="text.secondary">
              Earnings: {formatCurrency(data.earnings)}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            Entries: {data.entryCount}
          </Typography>
        </Box>
      );
    }
    return null;
  };

  const CustomLegend = ({ payload }: any) => {
    if (!payload || payload.length === 0) return null;
    
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box
            sx={{
              width: 12,
              height: 2,
              backgroundColor: theme.palette.primary.main,
              borderRadius: 0.5,
            }}
          />
          <Typography variant="caption">Time (hours)</Typography>
        </Box>
        {showEarnings && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{
                width: 12,
                height: 2,
                backgroundColor: theme.palette.secondary.main,
                borderRadius: 0.5,
              }}
            />
            <Typography variant="caption">Earnings ($)</Typography>
          </Box>
        )}
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
        {title || getDefaultTitle()}
      </Typography>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart
          data={chartData}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 20,
          }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={isDarkMode ? '#333333' : '#e0e0e0'}
          />
          <XAxis
            dataKey="period"
            tick={{
              fill: isDarkMode ? '#ffffff' : '#000000',
              fontSize: 12,
            }}
            tickFormatter={formatPeriodLabel}
          />
          <YAxis
            yAxisId="time"
            orientation="left"
            tick={{
              fill: isDarkMode ? '#ffffff' : '#000000',
              fontSize: 12,
            }}
            label={{
              value: 'Hours',
              angle: -90,
              position: 'insideLeft',
              style: { textAnchor: 'middle', fill: isDarkMode ? '#ffffff' : '#000000' },
            }}
          />
          {showEarnings && (
            <YAxis
              yAxisId="earnings"
              orientation="right"
              tick={{
                fill: isDarkMode ? '#ffffff' : '#000000',
                fontSize: 12,
              }}
              label={{
                value: 'Earnings ($)',
                angle: 90,
                position: 'insideRight',
                style: { textAnchor: 'middle', fill: isDarkMode ? '#ffffff' : '#000000' },
              }}
            />
          )}
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
          <Line
            yAxisId="time"
            type="monotone"
            dataKey="timeHours"
            stroke={theme.palette.primary.main}
            strokeWidth={3}
            dot={{ fill: theme.palette.primary.main, strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, stroke: theme.palette.primary.main, strokeWidth: 2 }}
            name="Time (hours)"
          />
          {showEarnings && (
            <Line
              yAxisId="earnings"
              type="monotone"
              dataKey="earnings"
              stroke={theme.palette.secondary.main}
              strokeWidth={3}
              dot={{ fill: theme.palette.secondary.main, strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: theme.palette.secondary.main, strokeWidth: 2 }}
              name="Earnings ($)"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
