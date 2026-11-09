/**
 * The Calendar's month as a grid of days, with each week's totals when
 * there's room. One day is in the tab order; the arrow keys move between
 * days (into the next or previous month when they run off this one), Home
 * and End go to the week's ends, Page Up and Page Down change month, and
 * Enter or Space opens the day.
 */

import { KeyboardEvent, useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import dayjs from 'dayjs';
import { formatCents } from '../../../utils/payoutCalculator';
import { formatDurationCompact } from '../../../utils/formatters';
import { formatShortDate, formattingLocale } from '../../../utils/locale';
import { parseDateStringLocal } from '../../../utils/dateHelpers';
import { CalendarMonth, CalendarWeek } from './calendarMonth';
import { DayCell } from './DayCell';
import { PHONE } from '../../../theme/media';

/** The grid is wide enough for a column of week totals. */
export const WITH_WEEKS = '@container calendar (min-width: 820px)';

const COLUMNS = {
  display: 'grid',
  gap: 0.5,
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  [WITH_WEEKS]: { gridTemplateColumns: 'repeat(7, minmax(0, 1fr)) minmax(96px, 0.9fr)' },
} as const;

/** Sun…Sat in the formatting locale (Nov 1 2026 is a Sunday). */
const weekdayName = (index: number) =>
  new Date(2026, 10, 1 + index).toLocaleDateString(formattingLocale(), { weekday: 'short' });

/** Where a key moves the focus from `date`, or null for a key the grid doesn't use. */
export function keyTarget(key: string, date: string): string | null {
  const at = dayjs(date);
  const moves: Record<string, () => dayjs.Dayjs> = {
    ArrowLeft: () => at.subtract(1, 'day'),
    ArrowRight: () => at.add(1, 'day'),
    ArrowUp: () => at.subtract(7, 'day'),
    ArrowDown: () => at.add(7, 'day'),
    Home: () => at.subtract(at.day(), 'day'),
    End: () => at.add(6 - at.day(), 'day'),
    PageUp: () => at.subtract(1, 'month'),
    PageDown: () => at.add(1, 'month'),
  };
  const move = moves[key];
  return move ? move().format('YYYY-MM-DD') : null;
}

function WeekTotal({ week }: { week: CalendarWeek }) {
  const worked = week.earnedCents > 0 || week.timeMs > 0;
  const amount = `${week.estimatedCents > 0 ? '~' : ''}${formatCents(week.earnedCents)}`;
  const label = `Week of ${formatShortDate(parseDateStringLocal(week.days[0].date))}: ${
    worked ? `${formatDurationCompact(week.timeMs)}, ${amount}` : 'nothing tracked'
  }`;
  return (
    <Box
      role="gridcell"
      aria-label={label}
      sx={{
        display: 'none',
        [WITH_WEEKS]: { display: 'flex' },
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-end',
        px: 1.5,
        borderRadius: 1,
        bgcolor: 'action.hover',
      }}
    >
      {worked && (
        <>
          <Typography sx={{ fontFamily: '"Roboto Mono", monospace', fontWeight: 700, fontSize: '0.9rem' }}>
            {amount}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatDurationCompact(week.timeMs)}
          </Typography>
        </>
      )}
    </Box>
  );
}

export interface MonthGridProps {
  view: CalendarMonth;
  /** The day that's in the tab order (and keeps the focus across months). */
  focusedDate: string;
  onFocusDate: (date: string) => void;
  /** Moves to the month (YYYY-MM) a key ran into. */
  onMonthChange: (month: string) => void;
  onOpenDay: (date: string) => void;
  labelledBy: string;
}

export function MonthGrid({ view, focusedDate, onFocusDate, onMonthChange, onOpenDay, labelledBy }: MonthGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  // A key moved the focus: put it on the day once it's rendered
  const moveFocus = useRef(false);

  const days = view.weeks.flatMap(week => week.days);
  const shown = days.some(day => day.date === focusedDate);
  const firstOfMonth = `${view.month}-01`;
  const tabbable = shown ? focusedDate : firstOfMonth;

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${tabbable}"]`)?.focus();
  }, [tabbable]);

  const handleKeyDown = (event: KeyboardEvent) => {
    const next = keyTarget(event.key, tabbable);
    if (next === null) return;
    event.preventDefault();
    if (next === tabbable) return;
    moveFocus.current = true;
    onFocusDate(next);
    if (!days.some(day => day.date === next && day.inMonth)) onMonthChange(next.slice(0, 7));
  };

  return (
    <Box sx={{ containerType: 'inline-size', containerName: 'calendar' }}>
      <Box role="grid" aria-labelledby={labelledBy} ref={gridRef} onKeyDown={handleKeyDown}>
        <Box role="row" sx={{ ...COLUMNS, mb: 0.5 }}>
          {[0, 1, 2, 3, 4, 5, 6].map(index => (
            <Typography
              key={index}
              role="columnheader"
              variant="caption"
              color="text.secondary"
              sx={{
                px: 1,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                [PHONE]: { px: 0, letterSpacing: 0, textAlign: 'center', fontSize: '0.65rem' },
              }}
            >
              {weekdayName(index)}
            </Typography>
          ))}
          <Typography
            role="columnheader"
            variant="caption"
            color="text.secondary"
            sx={{
              display: 'none',
              [WITH_WEEKS]: { display: 'block' },
              px: 1.5,
              textAlign: 'right',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Week
          </Typography>
        </Box>
        {view.weeks.map(week => (
          <Box role="row" key={week.days[0].date} sx={{ ...COLUMNS, mb: 0.5 }}>
            {week.days.map(day => (
              <DayCell
                key={day.date}
                day={day}
                tabbable={day.date === tabbable}
                onOpen={onOpenDay}
                onFocusDay={onFocusDate}
              />
            ))}
            <WeekTotal week={week} />
          </Box>
        ))}
      </Box>
    </Box>
  );
}
