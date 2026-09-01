/**
 * PayoutsPage tests: scorecard aggregation, estimate labeling, and opening
 * the import dialog. Contexts and the work-log hook are module-mocked per the
 * page-test convention.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '../../../../__tests__/setup/test-helpers';
import { PayoutsPage } from '../PayoutsPage';
import { Task } from '../../../../types/task';
import { TaskSession, TimerState } from '../../../../types/timer';
import { UseWorkLogsReturn } from '../../../../hooks/useWorkLogs';
import { formatDateString } from '../../../../utils/dateHelpers';
import {
  createMockTask,
  createMockWorkLogEntry,
} from '../../../../__tests__/setup/session-test-utils';

let mockWorkLogsReturn: UseWorkLogsReturn;
vi.mock('../../../../hooks/useWorkLogs', () => ({
  useWorkLogs: () => mockWorkLogsReturn,
}));

const mockSessionContext = { sessions: [] as TaskSession[] };
vi.mock('../../../../contexts/SessionManagementContext', () => ({
  useSessionManagementContext: () => mockSessionContext,
}));

const mockAddTask = vi.fn();
const mockUpdateTask = vi.fn();
const mockTaskContext = {
  tasks: [] as Task[],
  addTask: mockAddTask,
  updateTask: mockUpdateTask,
};
vi.mock('../../../../contexts/TaskManagementContext', () => ({
  useTaskManagementContext: () => mockTaskContext,
}));

vi.mock('../../../../hooks/useFundsReleaseSettings', () => ({
  useFundsReleaseSettings: () => ({ days: 7, updateDays: vi.fn() }),
}));

/** Local YYYY-MM-DD for today + offset days (calendar-safe across DST). */
function dayOffset(offset: number): string {
  const t = new Date();
  return formatDateString(new Date(t.getFullYear(), t.getMonth(), t.getDate() + offset));
}

function stoppedSessionOn(offset: number, taskId: string, hours: number): TaskSession {
  const t = new Date();
  const start = new Date(t.getFullYear(), t.getMonth(), t.getDate() + offset, 9, 0);
  return {
    id: `session-${taskId}-${offset}`,
    taskId,
    taskName: `Task ${taskId}`,
    timerInstances: [
      {
        id: `instance-${taskId}-${offset}`,
        sessionId: `session-${taskId}-${offset}`,
        startTime: start,
        endTime: new Date(start.getTime() + hours * 3_600_000),
        duration: hours * 3_600_000,
        state: TimerState.stopped,
        isRunning: false,
        isPaused: false,
        createdAt: start.toISOString(),
        updatedAt: start.toISOString(),
      },
    ],
    totalDuration: hours * 3_600_000,
    isActive: false,
    date: dayOffset(offset),
    createdAt: start.toISOString(),
    updatedAt: start.toISOString(),
  };
}

describe('PayoutsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkLogsReturn = {
      entries: [],
      mappings: [],
      isLoading: false,
      error: null,
      loadWarning: null,
      reload: vi.fn(),
      applyImport: vi.fn(),
    };
    mockSessionContext.sessions = [];
    mockTaskContext.tasks = [];
  });

  it('splits imported money into available and pending by release day', () => {
    mockWorkLogsReturn.entries = [
      createMockWorkLogEntry({ id: 'released', workDay: dayOffset(-10), amountCents: 30000 }),
      createMockWorkLogEntry({ id: 'waiting', workDay: dayOffset(-2), amountCents: 12300 }),
    ];

    render(<PayoutsPage />);

    expect(screen.getByText('Available now')).toBeInTheDocument();
    expect(screen.getAllByText('$300.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Pending release')).toBeInTheDocument();
    expect(screen.getAllByText('$123.00').length).toBeGreaterThan(0);
  });

  it('estimates un-imported tracked days from the task rate and labels them', () => {
    mockTaskContext.tasks = [createMockTask({ id: 'task-2', name: 'Rated', hourlyRate: 50 })];
    mockSessionContext.sessions = [stoppedSessionOn(0, 'task-2', 2)];

    render(<PayoutsPage />);

    // 2h × $50 = $100 estimated scorecard, and an Estimate source chip.
    expect(screen.getByText('Estimated (not imported)')).toBeInTheDocument();
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Estimate')).toBeInTheDocument();
  });

  it('marks imported days as actual in the reconciliation table', () => {
    mockWorkLogsReturn.entries = [
      createMockWorkLogEntry({ workDay: dayOffset(-1), amountCents: 7500, timeInMinutes: 60 }),
    ];

    render(<PayoutsPage />);

    expect(screen.getByText('Actual')).toBeInTheDocument();
    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
  });

  it('shows the empty state and opens the import dialog', async () => {
    render(<PayoutsPage />);

    expect(screen.getByText('No payout data yet')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /import work logs/i })[0]);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('surfaces a persistent load warning', () => {
    mockWorkLogsReturn.loadWarning = '2 saved work-log record(s) could not be read';
    render(<PayoutsPage />);
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
  });
});
