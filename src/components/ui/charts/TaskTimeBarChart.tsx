// import React from 'react'; // Commented out unused import
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useTheme } from '@mui/material/styles';
import { Box, Typography } from '@mui/material';
import { TaskTimeData, millisecondsToHours, formatTimeForChart, generateChartColors } from '../../../utils/chartDataHelpers';
import { formatCurrency } from '../../../utils/formatters';

interface TaskTimeBarChartProps {
  data: TaskTimeData[];
  showEarnings?: boolean;
  height?: number;
  title?: string;
}

export function TaskTimeBarChart({
  data,
  showEarnings = true,
  height = 400,
  title = 'Time Spent by Task',
}: TaskTimeBarChartProps) {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // Prepare data for chart
  const chartData = data.map((item, index) => ({
    taskName: item.taskName.length > 15 ? `${item.taskName.substring(0, 15)}...` : item.taskName,
    fullTaskName: item.taskName,
    timeHours: millisecondsToHours(item.totalTime),
    earnings: item.totalEarnings,
    entryCount: item.entryCount,
    color: generateChartColors(data.length)[index],
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
            {data.fullTaskName}
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
        {showEarnings && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  backgroundColor: theme.palette.primary.main,
                  borderRadius: 0.5,
                }}
              />
              <Typography variant="caption">Time (hours)</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  backgroundColor: theme.palette.secondary.main,
                  borderRadius: 0.5,
                }}
              />
              <Typography variant="caption">Earnings ($)</Typography>
            </Box>
          </>
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
      {title && (
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, textAlign: 'center' }}>
          {title}
        </Typography>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={chartData}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 60,
          }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={isDarkMode ? '#333333' : '#e0e0e0'}
          />
          <XAxis
            dataKey="taskName"
            tick={{
              fill: isDarkMode ? '#ffffff' : '#000000',
              fontSize: 12,
            }}
            angle={-45}
            textAnchor="end"
            height={80}
            interval={0}
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
          <Bar
            yAxisId="time"
            dataKey="timeHours"
            fill={theme.palette.primary.main}
            name="Time (hours)"
            radius={[4, 4, 0, 0]}
          />
          {showEarnings && (
            <Bar
              yAxisId="earnings"
              dataKey="earnings"
              fill={theme.palette.secondary.main}
              name="Earnings ($)"
              radius={[4, 4, 0, 0]}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );
}
