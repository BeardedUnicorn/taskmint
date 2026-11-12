/**
 * Home: where the app opens. What's running and a quick way to start, what
 * today and this week have earned, the daily goal, the next withdrawal, the
 * last few sessions, and a nudge when the work logs haven't been imported
 * for a while. Every figure is the one the page it comes from shows.
 */

import { useMemo } from 'react';
import dayjs from 'dayjs';
import { Alert, Box, Button, Chip, List, ListItem, ListItemText, Paper, Stack, Typography } from '@mui/material';
import {
  CalendarMonth as WeekIcon,
  MoreTime as AddTimeIcon,
  PlayArrow as PlayIcon,
  Task as TaskIcon,
  Today as TodayIcon,
} from '@mui/icons-material';
import { PageContainer, PageHeader, PageSkeleton } from '../../layout/PageLayout';
import { SessionTimerToolbar } from '../../layout/SessionTimerToolbar';
import { GoalProgress } from '../../layout/GoalProgress';
import { StatsCard } from '../../ui/display/StatsCard';
import { EmptyState } from '../../ui/display/EmptyState';
import { NextWithdrawalPanel } from '../payouts/withdrawals/NextWithdrawalPanel';
import { useNavigation } from '../../../contexts/NavigationContext';
import { useSessionManagementContext } from '../../../contexts/SessionManagementContext';
import { useTaskManagementContext } from '../../../contexts/TaskManagementContext';
import { useDailyGoalProgress } from '../../../contexts/DailyGoalProgressContext';
import { usePayoutData } from '../../../hooks/usePayoutData';
import { useNowMs } from '../../../hooks/useNowMs';
import { TaskSession } from '../../../types/timer';
import { orderTasksForStart } from '../../../utils/taskOrdering';
import { getSessionElapsedMs, hasRunningTimer, sessionTitle } from '../../../utils/timerHelpers';
import { sessionEarnings } from '../../../utils/earnings';
import { formatCurrency, formatDate, formatDurationCompact, formatTime } from '../../../utils/formatters';
import { formatLocalDate } from '../../../utils/dateHelpers';
import { formatCents } from '../../../utils/payoutCalculator';
import { formatShortDateTime } from '../../../utils/locale';
import { PHONE } from '../../../theme/media';
import { PeriodTotals, periodTotals, thisWeek } from './homeTotals';

/** How many tasks Home offers to start with one click. */
const QUICK_START_COUNT = 4;
/** How many finished sessions Home lists. */
const RECENT_COUNT = 3;

/** Two figures side by side; on a phone too (they're short). */
const STATS_GRID = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 3,
  mb: 3,
  [PHONE]: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2 },
} as const;

const SECTION_TITLE = { mb: 1.5, fontWeight: 600 } as const;

interface HomePageProps {
  /** Opens the app's Start Work dialog. */
  onStartWork: () => void;
  /** Opens the app's Add Time dialog. */
  onAddTime: () => void;
}

const money = (totals: PeriodTotals) => `${totals.estimatedCents > 0 ? '~' : ''}${formatCents(totals.earnedCents)}`;

/** The active session's controls and figures, or ways to start. */
function RightNow({ onStartWork, onAddTime, nowMs }: HomePageProps & { nowMs: number }) {
  const { navigate } = useNavigation();
  const {
    sessions,
    activeSession,
    startTask,
    endActiveSession,
    pauseAllTimersInActiveSession,
    resumeAllTimersInActiveSession,
  } = useSessionManagementContext();
  const { tasks } = useTaskManagementContext();
  const startOptions = useMemo(() => orderTasksForStart(tasks, sessions), [tasks, sessions]);

  if (!activeSession && startOptions.length === 0) {
    return (
      <EmptyState
        icon={<TaskIcon />}
        title="Add a task to start tracking"
        description="Work is tracked against a task and its hourly rate."
        action={
          <Button variant="contained" onClick={() => navigate('tasks', { intent: 'new-task' })}>
            New task
          </Button>
        }
      />
    );
  }

  return (
    <Box>
      <SessionTimerToolbar
        activeSession={activeSession}
        startOptions={startOptions}
        onStartTask={startTask}
        onEndSession={endActiveSession}
        onSwitchTask={onStartWork}
        onPauseAll={pauseAllTimersInActiveSession}
        onResumeAll={resumeAllTimersInActiveSession}
      />
      {activeSession ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 0 }}>
            This session:{' '}
            <Box component="span" sx={{ fontFamily: '"Roboto Mono", monospace' }}>
              {formatTime(getSessionElapsedMs(activeSession, nowMs))}
            </Box>{' '}
            · {formatCurrency(sessionEarnings(activeSession, tasks, nowMs))}
          </Typography>
          <Button size="small" onClick={() => navigate('sessions')}>
            Open Sessions
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
            Quick start:
          </Typography>
          {startOptions.slice(0, QUICK_START_COUNT).map(task => (
            <Chip
              key={task.id}
              icon={<PlayIcon />}
              label={task.name}
              onClick={() => void startTask(task.id, task.name)}
              aria-label={`Start ${task.name}`}
              variant="outlined"
              color="primary"
              sx={{ maxWidth: '100%' }}
            />
          ))}
          <Button size="small" startIcon={<AddTimeIcon />} onClick={onAddTime} sx={{ ml: 'auto' }}>
            Add time
          </Button>
        </Box>
      )}
    </Box>
  );
}

/** The last few finished sessions, newest first. */
function RecentSessions({ sessions, nowMs }: { sessions: TaskSession[]; nowMs: number }) {
  const { navigate } = useNavigation();
  const { tasks } = useTaskManagementContext();
  const recent = useMemo(
    () =>
      sessions
        .filter(session => !session.isActive)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, RECENT_COUNT),
    [sessions]
  );

  return (
    <Box component="section" aria-labelledby="home-recent">
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography id="home-recent" variant="h6" component="h2" sx={SECTION_TITLE}>
          Recent sessions
        </Typography>
        <Button size="small" onClick={() => navigate('history')} sx={{ mb: 1.5 }}>
          See all in History
        </Button>
      </Box>
      {recent.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Finished sessions show here.
        </Typography>
      ) : (
        <Paper variant="outlined">
          <List disablePadding>
            {recent.map((session, index) => (
              <ListItem key={session.id} divider={index < recent.length - 1}>
                <ListItemText
                  primary={sessionTitle(session)}
                  secondary={`${formatLocalDate(session.date)} · ${formatDurationCompact(getSessionElapsedMs(session, nowMs))}`}
                  slotProps={{ primary: { noWrap: true } }}
                  sx={{ minWidth: 0 }}
                />
                <Typography variant="body2" sx={{ ml: 2, fontWeight: 600, flexShrink: 0 }}>
                  {formatCurrency(sessionEarnings(session, tasks, nowMs))}
                </Typography>
              </ListItem>
            ))}
          </List>
        </Paper>
      )}
    </Box>
  );
}

export function HomePage({ onStartWork, onAddTime }: HomePageProps) {
  const { navigate } = useNavigation();
  const { sessions, hasLoaded } = useSessionManagementContext();
  const { isLoading: tasksLoading } = useTaskManagementContext();
  const goal = useDailyGoalProgress();
  const { cells, today, lastImport, importIsStale } = usePayoutData();
  // One clock for the live figures, ticking only while a timer runs
  const nowMs = useNowMs(hasRunningTimer(sessions), 1000);

  const totals = useMemo(() => {
    const week = thisWeek(dayjs(today));
    return {
      today: periodTotals(cells, today, today),
      week: periodTotals(cells, week.from, week.to),
      weekFrom: week.from,
    };
  }, [cells, today]);

  if (!hasLoaded || tasksLoading) return <PageSkeleton />;

  return (
    <PageContainer>
      <PageHeader title="Home" subtitle={formatDate(new Date(nowMs))} />

      {lastImport !== null && importIsStale && (
        <Alert
          severity="info"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={() => navigate('payouts', { intent: 'import-work-logs' })}>
              Import work logs
            </Button>
          }
        >
          Your last work-log import was {formatShortDateTime(lastImport)}. Import again to bring payouts up to date.
        </Alert>
      )}

      <Stack spacing={3}>
        <Box component="section" aria-labelledby="home-now">
          <Typography id="home-now" variant="h6" component="h2" sx={SECTION_TITLE}>
            Right now
          </Typography>
          <RightNow onStartWork={onStartWork} onAddTime={onAddTime} nowMs={nowMs} />
        </Box>

        <Box component="section" aria-label="Today and this week">
          <Box sx={STATS_GRID}>
            <StatsCard
              title="Today"
              value={money(totals.today)}
              subtitle={
                totals.today.timeMs > 0 ? `${formatDurationCompact(totals.today.timeMs)} worked` : 'Nothing tracked yet'
              }
              icon={<TodayIcon sx={{ fontSize: 40 }} />}
              color="success"
            />
            <StatsCard
              title="This week"
              value={money(totals.week)}
              subtitle={`${formatDurationCompact(totals.week.timeMs)} since ${dayjs(totals.weekFrom).format('ddd, MMM D')}`}
              icon={<WeekIcon sx={{ fontSize: 40 }} />}
              color="primary"
            />
          </Box>
          {goal.enabled && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <GoalProgress progress={goal} />
            </Paper>
          )}
        </Box>

        <NextWithdrawalPanel />

        <RecentSessions sessions={sessions} nowMs={nowMs} />
      </Stack>
    </PageContainer>
  );
}
