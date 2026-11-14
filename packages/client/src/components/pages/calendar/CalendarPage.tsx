/**
 * Calendar Page
 *
 * The month at a glance: what each day earned and how long it was worked,
 * the money released each day, the withdrawals taken, and when the next
 * withdrawal opens and how much it will be. A day opens its breakdown.
 *
 * A desktop shows the month as a grid, and a day's breakdown in a dialog. A
 * phone lists the month's weeks and days instead (MonthAgenda), the month
 * first and the withdrawal panel under it, and a day opens in place.
 */

import { ReactNode, useId, useMemo, useState } from 'react';
import { Box, Button, IconButton, Paper, Skeleton, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  ArrowDownward as ReleaseIcon,
  CalendarMonth as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Savings as WithdrawalIcon,
  Schedule as OpensIcon,
} from '@mui/icons-material';
import dayjs from 'dayjs';
import { PageContainer, PageHeader } from '../../layout/PageLayout';
import { EmptyState } from '../../ui/display/EmptyState';
import { usePayoutData } from '../../../hooks/usePayoutData';
import { useWithdrawals } from '../../../hooks/useWithdrawals';
import { useDailyGoals } from '../../../hooks/useDailyGoals';
import { formatCents } from '../../../utils/payoutCalculator';
import { formatDurationCompact } from '../../../utils/formatters';
import { formatMonthYear } from '../../../utils/locale';
import { useCompactLayout } from '../../../hooks/useCompactLayout';
import { NextWithdrawalPanel } from '../payouts/withdrawals/NextWithdrawalPanel';
import { buildCalendarMonth, goalForDay } from './calendarMonth';
import { MonthGrid } from './MonthGrid';
import { MonthAgenda } from './MonthAgenda';
import { CalendarDayDialog } from './CalendarDayDialog';
import { PHONE } from '../../../theme/media';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography sx={{ fontFamily: '"Roboto Mono", monospace', fontWeight: 600 }}>{value}</Typography>
    </Box>
  );
}

function LegendItem({
  tone,
  dashed,
  icon,
  children,
}: {
  tone: 'primary' | 'info' | 'success';
  dashed?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
      <Box
        sx={theme => ({
          width: 18,
          height: 14,
          borderRadius: 0.75,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: theme.palette[tone].main,
          bgcolor: dashed ? 'transparent' : alpha(theme.palette[tone].main, 0.16),
          border: dashed ? `1px dashed ${theme.palette[tone].main}` : 'none',
          '& svg': { fontSize: 11 },
        })}
      >
        {icon}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {children}
      </Typography>
    </Box>
  );
}

const CalendarPage = () => {
  const { cells, events, plan, nowMs, today, isLoading, isEmpty } = usePayoutData();
  const { withdrawals } = useWithdrawals();
  const { currentGoal, achievements } = useDailyGoals();
  const compact = useCompactLayout();
  const titleId = useId();

  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [focusedDate, setFocusedDate] = useState(today);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const goalFor = useMemo(() => goalForDay(achievements, currentGoal), [achievements, currentGoal]);

  const view = useMemo(
    () => buildCalendarMonth(month, { cells, events, withdrawals, plan, nowMs, goalFor }),
    [month, cells, events, withdrawals, plan, nowMs, goalFor]
  );
  const { summary } = view;

  const goToMonth = (next: string) => {
    setMonth(next);
    setFocusedDate(next === thisMonth ? today : `${next}-01`);
    setOpenDay(null);
  };
  const shiftMonth = (by: number) => goToMonth(dayjs(`${month}-01`).add(by, 'month').format('YYYY-MM'));

  const header = <PageHeader title="Calendar" subtitle="Your work, releases and withdrawals, day by day" />;

  if (isLoading) {
    return (
      <PageContainer>
        {header}
        <Skeleton variant="rounded" height={560} aria-label="Loading calendar" />
      </PageContainer>
    );
  }

  if (isEmpty && withdrawals.length === 0) {
    return (
      <PageContainer>
        {header}
        <EmptyState
          icon={<CalendarIcon />}
          title="Nothing on the calendar yet"
          description="Track time on a task with an hourly rate, or import your work logs on the Payouts page, and each day's earnings show up here."
        />
      </PageContainer>
    );
  }

  const earned = `${summary.estimatedCents > 0 ? '~' : ''}${formatCents(summary.earnedCents)}`;

  return (
    <PageContainer>
      {header}
      {!compact && <NextWithdrawalPanel />}

      <Paper sx={{ p: { xs: 1.5, sm: 2.5 } }}>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            mb: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, [PHONE]: { width: '100%' } }}>
            <IconButton aria-label="Previous month" onClick={() => shiftMonth(-1)}>
              <ChevronLeft />
            </IconButton>
            <Typography
              id={titleId}
              variant="h5"
              component="h2"
              aria-live="polite"
              sx={{
                fontWeight: 700,
                minWidth: 190,
                textAlign: 'center',
                [PHONE]: { minWidth: 0, flex: 1, fontSize: '1.1rem' },
              }}
            >
              {formatMonthYear(dayjs(`${month}-01`).toDate())}
            </Typography>
            <IconButton aria-label="Next month" onClick={() => shiftMonth(1)}>
              <ChevronRight />
            </IconButton>
            <Button
              size="small"
              // An outlined button that's disabled reads as an empty box on a phone
              variant={compact ? 'text' : 'outlined'}
              disabled={month === thisMonth}
              onClick={() => goToMonth(thisMonth)}
              sx={{ ml: 1 }}
            >
              Today
            </Button>
          </Box>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: { xs: 2, sm: 3 },
              // Three and two on a phone, lined up, instead of however they wrap
              [PHONE]: { width: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 },
            }}
          >
            <Stat label="Tracked" value={formatDurationCompact(summary.timeMs)} />
            <Stat label="Earned" value={earned} />
            <Stat label="Days worked" value={String(summary.daysWorked)} />
            <Stat label="Released" value={formatCents(summary.releasedCents)} />
            <Stat label="Withdrawn" value={formatCents(summary.withdrawnCents)} />
          </Box>
        </Box>

        {compact ? (
          <MonthAgenda
            view={view}
            openDay={openDay}
            onToggleDay={date => setOpenDay(openDay === date ? null : date)}
            labelledBy={titleId}
          />
        ) : (
          <MonthGrid
            view={view}
            focusedDate={focusedDate}
            onFocusDate={setFocusedDate}
            onMonthChange={setMonth}
            onOpenDay={setOpenDay}
            labelledBy={titleId}
          />
        )}

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
          {/* The agenda doesn't tint worked days */}
          {!compact && <LegendItem tone="primary">Worked</LegendItem>}
          <LegendItem tone="info" icon={<ReleaseIcon />}>
            Released
          </LegendItem>
          <LegendItem tone="info" dashed icon={<ReleaseIcon />}>
            To be released
          </LegendItem>
          <LegendItem tone="success" icon={<WithdrawalIcon />}>
            Withdrawn
          </LegendItem>
          <LegendItem tone="success" dashed icon={<OpensIcon />}>
            Next withdrawal opens
          </LegendItem>
          <Typography variant="caption" color="text.secondary">
            ~ estimated from tracked time (not imported yet)
          </Typography>
        </Box>
      </Paper>

      {compact ? (
        <NextWithdrawalPanel />
      ) : (
        <CalendarDayDialog date={openDay} onChangeDate={setOpenDay} onClose={() => setOpenDay(null)} />
      )}
    </PageContainer>
  );
};

export default CalendarPage;
