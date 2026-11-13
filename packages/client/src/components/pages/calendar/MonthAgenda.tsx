/**
 * The Calendar's month on a phone: a list of its weeks, each with its time
 * and earnings, and under it a row for each day with something on it (work,
 * a release, a withdrawal, the next withdrawal's opening) and for today. A
 * row shows the day's time, goal bar, amount and badges, and opens the day's
 * breakdown in place. The weeks are the month grid's, so the totals match
 * the desktop's Week column; days from the neighbouring months are muted.
 */

import { Box, ButtonBase, Collapse, LinearProgress, Paper, Typography } from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { formatDurationCompact } from '../../../utils/formatters';
import { parseDateStringLocal } from '../../../utils/dateHelpers';
import { formattingLocale } from '../../../utils/locale';
import { CalendarDay, CalendarMonth, CalendarWeek, dayGoalPercent, dayHasActivity, dayWorked } from './calendarMonth';
import { describeDay, describeWeek, earnedText, weekTitle } from './calendarText';
import { DayBadges } from './DayBadges';
import { DayDetails } from './DayDetails';
import { focusColor } from '../../../theme/components';
import { brandText } from '../../../theme/palettes';

const MONO_FIGURE = { fontFamily: '"Roboto Mono", monospace', fontWeight: 700 } as const;

/** "Mon" */
const weekday = (date: string) =>
  parseDateStringLocal(date).toLocaleDateString(formattingLocale(), { weekday: 'short' });

function AgendaDay({ day, open, onToggle }: { day: CalendarDay; open: boolean; onToggle: (date: string) => void }) {
  const worked = dayWorked(day);
  const goalPercent = dayGoalPercent(day);
  const hasBadges = day.releasedCents > 0 || day.withdrawals.length > 0 || day.opensAtMs !== null || day.openNow;
  const detailsId = `calendar-day-${day.date}`;

  return (
    <Box role="listitem" sx={{ '& + &': { borderTop: 1, borderColor: 'divider' } }}>
      <ButtonBase
        data-date={day.date}
        aria-label={describeDay(day)}
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => onToggle(day.date)}
        sx={theme => ({
          width: '100%',
          minHeight: 56,
          px: 2,
          py: 1.25,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 0.75,
          textAlign: 'left',
          opacity: day.inMonth ? 1 : 0.55,
          '&:focus-visible': { outline: `2px solid ${focusColor(theme.palette.mode)}`, outlineOffset: -2 },
        })}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 40, flexShrink: 0, textAlign: 'center' }}>
            <Typography
              variant="caption"
              component="div"
              sx={theme => ({
                color: day.isToday ? brandText(theme.palette.mode) : theme.palette.text.secondary,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                lineHeight: 1.4,
              })}
            >
              {weekday(day.date)}
            </Typography>
            <Box
              sx={{
                mx: 'auto',
                width: 30,
                height: 30,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                typography: 'body1',
                fontWeight: 700,
                color: day.isToday ? 'primary.contrastText' : 'text.primary',
                bgcolor: day.isToday ? 'primary.main' : 'transparent',
              }}
            >
              {day.dayOfMonth}
            </Box>
          </Box>

          <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <Typography variant="body2" color="text.secondary">
              {day.timeMs > 0 && formatDurationCompact(day.timeMs)}
            </Typography>
            {goalPercent !== null && (
              <LinearProgress
                variant="determinate"
                value={Math.min(100, goalPercent)}
                color={goalPercent >= 100 ? 'success' : 'primary'}
                aria-hidden
                sx={{ height: 4, borderRadius: 2 }}
              />
            )}
          </Box>

          {worked && <Typography sx={{ ...MONO_FIGURE, fontSize: '0.95rem' }}>{earnedText(day)}</Typography>}
          <ExpandMoreIcon
            aria-hidden
            sx={{
              color: 'text.secondary',
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 150ms',
            }}
          />
        </Box>
        {hasBadges && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, pl: '52px' }}>
            <DayBadges day={day} />
          </Box>
        )}
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        <Box id={detailsId}>
          <DayDetails day={day} />
        </Box>
      </Collapse>
    </Box>
  );
}

function AgendaWeek({
  week,
  openDay,
  onToggleDay,
}: {
  week: CalendarWeek;
  openDay: string | null;
  onToggleDay: (date: string) => void;
}) {
  const worked = week.earnedCents > 0 || week.timeMs > 0;
  const days = week.days.filter(day => dayHasActivity(day) || day.isToday);
  return (
    <Box role="listitem" aria-label={describeWeek(week)}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, px: 0.5, mb: 0.75 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ flex: 1, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          {weekTitle(week)}
        </Typography>
        {worked && (
          <>
            <Typography variant="caption" color="text.secondary">
              {formatDurationCompact(week.timeMs)}
            </Typography>
            <Typography sx={{ ...MONO_FIGURE, fontSize: '0.85rem' }}>{earnedText(week)}</Typography>
          </>
        )}
      </Box>
      <Paper variant="outlined">
        {days.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 1.5 }}>
            Nothing tracked
          </Typography>
        ) : (
          <Box role="list" aria-label={weekTitle(week)}>
            {days.map(day => (
              <AgendaDay key={day.date} day={day} open={openDay === day.date} onToggle={onToggleDay} />
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}

export interface MonthAgendaProps {
  view: CalendarMonth;
  /** The day whose breakdown is open (one at a time), or null. */
  openDay: string | null;
  /** Opens a day, or closes it when it's the open one. */
  onToggleDay: (date: string) => void;
  labelledBy: string;
}

export function MonthAgenda({ view, openDay, onToggleDay, labelledBy }: MonthAgendaProps) {
  return (
    <Box role="list" aria-labelledby={labelledBy} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {view.weeks.map(week => (
        <AgendaWeek key={week.days[0].date} week={week} openDay={openDay} onToggleDay={onToggleDay} />
      ))}
    </Box>
  );
}
