/**
 * What the History charts share: their size, the measure they draw, their
 * colours, the card shown for the point under the pointer, and a legend of
 * swatches. A chart draws one measure on one axis (time and earnings have
 * scales of their own; on two y-axes the lines tracked each other), and its
 * colours suit the light or dark theme. (Charts only get finished entries,
 * each with time in it, so there's always something to draw.)
 */

import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { brandText, type ColorMode } from '../../../theme/palettes';
import { useCompactLayout } from '../../../hooks/useCompactLayout';

/** How a chart fits its space: the plot's height and the room its axes take. */
export interface ChartLayout {
  height: number;
  /** Space beside the plot (the value axis has its own width too). */
  sideMargin: { left: number; right: number };
  /** The value axis's width. */
  axisWidth: number;
  tickFontSize: number;
  /** The value axis's title; the chart's title names the measure anyway. */
  axisTitles: boolean;
  pieRadius: number;
  /** Bars run across with the names down the side (a phone: names stay level). */
  barsAcross: boolean;
}

const DESKTOP_CHART: ChartLayout = {
  height: 400,
  sideMargin: { left: 20, right: 30 },
  // recharts' own default
  axisWidth: 60,
  tickFontSize: 12,
  axisTitles: true,
  pieRadius: 120,
  barsAcross: false,
};

// A phone's width goes to the plot
const PHONE_CHART: ChartLayout = {
  height: 300,
  sideMargin: { left: 0, right: 0 },
  axisWidth: 40,
  tickFontSize: 11,
  axisTitles: false,
  pieRadius: 100,
  barsAcross: true,
};

export function useChartLayout(): ChartLayout {
  return useCompactLayout() ? PHONE_CHART : DESKTOP_CHART;
}

/** What a chart draws: the time tracked, or the money earned. */
export type ChartMeasure = 'time' | 'earnings';

interface Measure {
  label: string;
  axisTitle: string;
  /** The point's field that holds it. */
  dataKey: 'timeHours' | 'earnings';
  tick: (value: number) => string;
}

export const MEASURES: Record<ChartMeasure, Measure> = {
  time: { label: 'Time', axisTitle: 'Hours', dataKey: 'timeHours', tick: value => `${value}h` },
  earnings: { label: 'Earnings', axisTitle: 'Earnings ($)', dataKey: 'earnings', tick: value => `$${value}` },
};

/** A chart's one series: the brand green, in its shade that reads on the mode's surface. */
export function useSeriesColor(): string {
  return brandText(useTheme().palette.mode);
}

/**
 * Tasks' colours: a categorical order checked for colour-blind readers, its
 * steps chosen for each mode's surface. Five at most; the rest fold into
 * Other, in a neutral grey.
 */
export const CATEGORICAL: Record<ColorMode, readonly string[]> = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
};
export const OTHER_COLOR: Record<ColorMode, string> = { light: '#9e9e9e', dark: '#757575' };

/** What recharts hands a tooltip's content: the hovered point(s), when there are any. */
export interface ChartTooltipProps<Point> {
  active?: boolean;
  payload?: ReadonlyArray<{ payload: Point }>;
  label?: string;
}

/** The hovered point, or null while nothing is hovered. */
export function hoveredPoint<Point>({ active, payload }: ChartTooltipProps<Point>): Point | null {
  return active && payload?.length ? payload[0].payload : null;
}

export function ChartTooltipCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Box sx={{ bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1, p: 2, boxShadow: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
        {title}
      </Typography>
      {lines.map(line => (
        <Typography key={line} variant="body2" color="text.secondary">
          {line}
        </Typography>
      ))}
    </Box>
  );
}

export interface LegendItem {
  label: string;
  color: string;
}

/** Swatches with their names; `shape` is a line, a square or a dot. */
export function ChartLegend({ items, shape }: { items: LegendItem[]; shape: 'line' | 'square' | 'dot' }) {
  const swatch = {
    line: { width: 12, height: 2, borderRadius: 0.5 },
    square: { width: 12, height: 12, borderRadius: 0.5 },
    dot: { width: 12, height: 12, borderRadius: '50%' },
  }[shape];
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, flexWrap: 'wrap', gap: 2 }}>
      {items.map(item => (
        <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
          <Box sx={{ ...swatch, flexShrink: 0, backgroundColor: item.color }} />
          <Typography
            variant="caption"
            title={item.label}
            sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {item.label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export function ChartTitle({ children }: { children: string }) {
  return (
    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, textAlign: 'center' }}>
      {children}
    </Typography>
  );
}
