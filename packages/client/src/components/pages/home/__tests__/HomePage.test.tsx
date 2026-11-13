/**
 * Home: what's running (or ways to start), today's and this week's figures
 * as the Calendar counts them, the goal, the next withdrawal, recent
 * sessions, and the nudge to import. Contexts are module-mocked per the
 * page-test convention; the money comes from a payout-data value.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '../../../../__tests__/setup/test-helpers';
import { HomePage } from '../HomePage';
import { NavigationProvider, useNavigation } from '../../../../contexts/NavigationContext';
import { DailyGoalProgressContext } from '../../../../contexts/DailyGoalProgressContext';
import { DailyGoalProgressData } from '../../../../hooks/useDailyGoalProgressMonitor';
import { PayoutData } from '../../../../hooks/usePayoutData';
import { PayoutDayCell } from '../../../../utils/payoutCalculator';
import { Task } from '../../../../types/task';
import { TaskSession } from '../../../../types/timer';
import { MoneyProviders, createMockPayoutData } from '../../../../__tests__/setup/payout-test-utils';
import {
  createMockTask,
  createMockTaskSession,
  createMockTimerInstance,
} from '../../../../__tests__/setup/session-test-utils';
import { periodTotals, thisWeek } from '../homeTotals';
import dayjs from 'dayjs';

const mockSessions = vi.hoisted(() => ({
  sessions: [] as TaskSession[],
  activeSession: null as TaskSession | null,
  hasLoaded: true,
  startTask: vi.fn(async () => undefined),
  endActiveSession: vi.fn(async () => undefined),
  pauseAllTimersInActiveSession: vi.fn(async () => undefined),
  resumeAllTimersInActiveSession: vi.fn(async () => undefined),
}));
vi.mock('../../../../contexts/SessionManagementContext', () => ({
  useSessionManagementContext: () => mockSessions,
}));

const mockTasks = vi.hoisted(() => ({ tasks: [] as Task[], isLoading: false }));
vi.mock('../../../../contexts/TaskManagementContext', () => ({
  useTaskManagementContext: () => mockTasks,
}));

/** Wednesday, November 11 2026, noon: its week runs Sunday the 8th to Saturday the 14th. */
const NOW = new Date(2026, 10, 11, 12, 0).getTime();

const noGoal: DailyGoalProgressData = { enabled: false, earned: 0, target: 0, percent: 0, currency: 'USD' };

function cell(workDay: string, overrides: Partial<PayoutDayCell> = {}): PayoutDayCell {
  return {
    workDay,
    taskId: 'task-1',
    taskName: 'Annotation',
    actualCents: 0,
    estimatedCents: 0,
    trackedMs: 0,
    importedMinutes: 0,
    statuses: [],
    releaseDay: '2026-11-20',
    isEstimate: false,
    untransferredCents: 0,
    paidCents: 0,
    ...overrides,
  };
}

/** Where the page sent the user, and with what. */
function Where() {
  const { view, params } = useNavigation();
  return <output aria-label="where">{`${view} ${JSON.stringify(params)}`}</output>;
}

const onStartWork = vi.fn();
const onAddTime = vi.fn();

function renderHome(data: Partial<PayoutData> = {}, goal = noGoal) {
  return render(
    <NavigationProvider>
      <DailyGoalProgressContext.Provider value={goal}>
        <MoneyProviders payoutData={createMockPayoutData({ nowMs: NOW, ...data })}>
          <HomePage onStartWork={onStartWork} onAddTime={onAddTime} />
          <Where />
        </MoneyProviders>
      </DailyGoalProgressContext.Provider>
    </NavigationProvider>
  );
}

const where = () => screen.getByRole('status', { name: 'where' }).textContent;

const finished = (id: string, updatedAt: string, hours = 1) =>
  createMockTaskSession({
    id,
    taskName: `Task ${id}`,
    date: updatedAt.slice(0, 10),
    updatedAt,
    timerInstances: [
      createMockTimerInstance({ id: `${id}-1`, sessionId: id, duration: hours * 3_600_000, endTime: updatedAt }),
    ],
  });

describe('HomePage', () => {
  beforeEach(() => {
    mockSessions.sessions = [];
    mockSessions.activeSession = null;
    mockSessions.hasLoaded = true;
    mockTasks.tasks = [createMockTask({ id: 'task-1', name: 'Annotation', hourlyRate: 30 })];
    mockTasks.isLoading = false;
  });

  it('shows the shape of the page until the sessions and tasks are in', () => {
    mockSessions.hasLoaded = false;
    renderHome();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();

    mockSessions.hasLoaded = true;
    mockTasks.isLoading = true;
    renderHome();
    expect(screen.queryByRole('heading', { name: 'Home', level: 1 })).not.toBeInTheDocument();
  });

  it('asks for a task first when there is nothing to start', () => {
    mockTasks.tasks = [];
    renderHome();

    expect(screen.getByRole('heading', { name: 'Home', level: 1 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New task' }));
    expect(where()).toBe('tasks {"intent":"new-task"}');
  });

  it('starts a task in one click, favorites first, and adds time', () => {
    mockTasks.tasks = ['A', 'B', 'C', 'D', 'E'].map(name => createMockTask({ id: name, name }));
    mockTasks.tasks.push(createMockTask({ id: 'fav', name: 'Favorite', isFavorite: true }));
    renderHome();

    const quick = screen.getAllByRole('button', { name: /^Start / });
    expect(quick.map(chip => chip.getAttribute('aria-label'))).toEqual([
      'Start Favorite',
      'Start A',
      'Start B',
      'Start C',
    ]);
    fireEvent.click(quick[0]);
    expect(mockSessions.startTask).toHaveBeenCalledWith('fav', 'Favorite');

    fireEvent.click(screen.getByRole('button', { name: 'Add time' }));
    expect(onAddTime).toHaveBeenCalled();
  });

  it('shows the active session with its time and earnings, and opens Sessions', () => {
    const session = createMockTaskSession({
      isActive: true,
      timerInstances: [createMockTimerInstance({ duration: 2 * 3_600_000, endTime: '2024-01-15T12:00:00Z' })],
    });
    mockSessions.sessions = [session];
    mockSessions.activeSession = session;
    renderHome();

    expect(screen.getByText(/This session:/)).toHaveTextContent('This session: 02:00:00 · $60.00');
    expect(screen.queryByText('Quick start:')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Sessions' }));
    expect(where()).toBe('sessions {}');
  });

  it('counts today and this week as the Calendar does, with ~ on estimates', () => {
    renderHome({
      cells: [
        cell('2026-11-11', { estimatedCents: 5000, trackedMs: 3_600_000, isEstimate: true }),
        cell('2026-11-09', { actualCents: 10000, importedMinutes: 120 }),
        cell('2026-11-07', { actualCents: 99999, trackedMs: 3_600_000 }),
      ],
    });

    const today = screen.getByText('Today').closest('.MuiCard-root') as HTMLElement;
    expect(within(today).getByText('~$50.00')).toBeInTheDocument();
    expect(within(today).getByText('1h 0m worked')).toBeInTheDocument();
    const week = screen.getByText('This week').closest('.MuiCard-root') as HTMLElement;
    expect(within(week).getByText('~$150.00')).toBeInTheDocument();
    expect(within(week).getByText('3h 0m since Sun, Nov 8')).toBeInTheDocument();
  });

  it('says when nothing is tracked today, and shows the goal only when one is set', () => {
    const { unmount } = renderHome();
    const today = screen.getByText('Today').closest('.MuiCard-root') as HTMLElement;
    expect(within(today).getByText('$0.00')).toBeInTheDocument();
    expect(within(today).getByText('Nothing tracked yet')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Today's goal/ })).not.toBeInTheDocument();
    unmount();

    renderHome({}, { enabled: true, earned: 40, target: 100, percent: 40, currency: 'USD' });
    expect(screen.getByRole('group', { name: "Today's goal: $40.00 of $100.00 (40%)" })).toBeInTheDocument();
  });

  it('nudges an import once the last one is a few days old', () => {
    const { unmount } = renderHome({ lastImport: NOW - 3_600_000, importIsStale: false });
    expect(screen.queryByText(/last work-log import/)).not.toBeInTheDocument();
    unmount();

    renderHome({ lastImport: NOW - 5 * 86_400_000, importIsStale: true });
    expect(screen.getByText(/Your last work-log import was/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import work logs' }));
    expect(where()).toBe('payouts {"intent":"import-work-logs"}');
  });

  it('lists the last three finished sessions, newest first, and opens History', () => {
    const active = createMockTaskSession({ id: 'live', taskName: 'Live', isActive: true });
    mockSessions.sessions = [
      finished('s1', '2026-11-01T10:00:00Z'),
      active,
      finished('s3', '2026-11-03T10:00:00Z', 2),
      finished('s2', '2026-11-02T10:00:00Z'),
      finished('s4', '2026-11-04T10:00:00Z'),
    ];
    mockSessions.activeSession = active;
    renderHome();

    const recent = within(screen.getByRole('region', { name: 'Recent sessions' }));
    expect(recent.getAllByRole('listitem').map(item => item.textContent)).toEqual([
      expect.stringMatching(/^Task s4Nov 4, 2026 · 1h 0m\$30\.00$/),
      expect.stringMatching(/^Task s3Nov 3, 2026 · 2h 0m\$60\.00$/),
      expect.stringMatching(/^Task s2/),
    ]);
    fireEvent.click(recent.getByRole('button', { name: 'See all in History' }));
    expect(where()).toBe('history {}');
  });

  it('says where finished sessions will show before there are any', () => {
    renderHome();
    expect(screen.getByText('Finished sessions show here.')).toBeInTheDocument();
  });
});

describe('homeTotals', () => {
  it('adds up the days in a range, inclusive', () => {
    const cells = [
      cell('2026-11-08', { actualCents: 100, trackedMs: 60_000 }),
      cell('2026-11-14', { estimatedCents: 50, importedMinutes: 2 }),
      cell('2026-11-15', { actualCents: 999 }),
    ];
    expect(periodTotals(cells, '2026-11-08', '2026-11-14')).toEqual({
      earnedCents: 150,
      estimatedCents: 50,
      timeMs: 180_000,
    });
  });

  it("takes this week from History's This week preset", () => {
    expect(thisWeek(dayjs('2026-11-11'))).toEqual({ from: '2026-11-08', to: '2026-11-14' });
  });
});
