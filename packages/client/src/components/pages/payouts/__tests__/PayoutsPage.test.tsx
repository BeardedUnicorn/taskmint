/**
 * PayoutsPage tests: scorecard aggregation, estimate labeling, and opening
 * the import dialog. Contexts and the work-log hook are module-mocked per the
 * page-test convention.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, within, waitFor } from '../../../../__tests__/setup/test-helpers';
import { PayoutsPage } from '../PayoutsPage';
import { WithdrawalsProvider } from '../../../../contexts/WithdrawalsContext';
import { PayoutDataProvider } from '../../../../contexts/PayoutDataContext';
import { Task } from '../../../../types/task';
import { TaskSession, TimerState } from '../../../../types/timer';
import { WorkLogContextValue } from '../../../../contexts/WorkLogContext';
import { formatDateString } from '../../../../utils/dateHelpers';
import {
  createEmptyImportUndo,
  createMockProjectTaskMapping,
  createMockTask,
  createMockWorkLogEntry,
} from '../../../../__tests__/setup/session-test-utils';
import userEvent from '@testing-library/user-event';
import { fakeBackend, installFakeBackendForTest, seedAppRecords } from '../../../../testing';
import { createMockWithdrawal } from '../../../../__tests__/setup/payout-test-utils';

const mockInvoke = fakeBackend().call;

let mockWorkLogsReturn: WorkLogContextValue;
vi.mock('../../../../contexts/WorkLogContext', () => ({
  useWorkLogContext: () => mockWorkLogsReturn,
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

const mockFundsRelease = vi.hoisted(() => ({ days: 7 }));
vi.mock('../../../../hooks/useFundsReleaseSettings', () => ({
  useFundsReleaseSettings: () => ({ days: mockFundsRelease.days, updateDays: vi.fn() }),
}));

/** The page with the app's money providers around it (over the mocked contexts). */
function renderPage() {
  return render(
    <WithdrawalsProvider>
      <PayoutDataProvider>
        <PayoutsPage />
      </PayoutDataProvider>
    </WithdrawalsProvider>
  );
}

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
        startTime: start.toISOString(),
        endTime: new Date(start.getTime() + hours * 3_600_000).toISOString(),
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
    mockInvoke.mockImplementation(async () => undefined);
    mockWorkLogsReturn = {
      entries: [],
      mappings: [],
      isLoading: false,
      loadWarning: null,
      applyImport: vi.fn(),
      undoImport: vi.fn(),
      stagedCapture: null,
      clearStagedCapture: vi.fn(),
    };
    mockSessionContext.sessions = [];
    mockTaskContext.tasks = [];
    mockFundsRelease.days = 7;
  });

  describe('withdrawals', () => {
    it('counts what is available from the last withdrawal, and lists the withdrawals', () => {
      seedAppRecords({
        withdrawals: [
          createMockWithdrawal({ id: 'last', takenAt: new Date(Date.now() - 2 * 86_400_000).toISOString() }),
        ],
      });
      mockWorkLogsReturn.entries = [
        // Released after the withdrawal (its report time + 7 days), not yet reported again
        createMockWorkLogEntry({
          id: 'since',
          status: 'Pending Approval',
          workDay: dayOffset(-8),
          createdAt: new Date(Date.now() - 8 * 86_400_000 + 3_600_000).toISOString(),
          updatedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
          amountCents: 40000,
        }),
      ];
      mockSessionContext.sessions = [stoppedSessionOn(-8, 'task-1', 1)];
      mockTaskContext.tasks = [createMockTask({ id: 'task-1', hourlyRate: 10 })];

      renderPage();

      const card = screen.getByText('Available to withdraw').closest('.MuiCard-root')!;
      expect(card).toHaveTextContent('$400.00');
      expect(card).toHaveTextContent('released since your withdrawal on');
      expect(screen.getByRole('region', { name: 'Withdrawals' })).toHaveTextContent('Next withdrawal');
      expect(screen.getByRole('table', { name: 'Withdrawals' })).toHaveTextContent('$712.50');
    });

    it('marks estimates in what is available', () => {
      seedAppRecords({
        withdrawals: [createMockWithdrawal({ takenAt: new Date(Date.now() - 9 * 86_400_000).toISOString() })],
      });
      mockSessionContext.sessions = [stoppedSessionOn(-8, 'task-1', 2)];
      mockTaskContext.tasks = [createMockTask({ id: 'task-1', hourlyRate: 10 })];

      renderPage();

      expect(screen.getByText('Available to withdraw').closest('.MuiCard-root')).toHaveTextContent('~$20.00');
    });
  });

  it('splits imported money into available and pending by release day', () => {
    mockWorkLogsReturn.entries = [
      createMockWorkLogEntry({ id: 'released', status: 'Untransferred', workDay: dayOffset(-10), amountCents: 30000 }),
      createMockWorkLogEntry({ id: 'waiting', status: 'Pending Approval', workDay: dayOffset(-2), amountCents: 12300 }),
    ];

    renderPage();

    const availableTitle = screen.getByText('Available now');
    const availableCard = availableTitle.closest('.MuiCard-root')!;
    expect(availableCard).toHaveTextContent('$300.00');

    expect(screen.getByText('Pending release')).toBeInTheDocument();
    expect(screen.getAllByText('$123.00').length).toBeGreaterThan(0);
  });

  it('only includes Untransferred in Available now, excluding Paid and Pending Approval', () => {
    mockWorkLogsReturn.entries = [
      createMockWorkLogEntry({
        id: 'untransferred',
        status: 'Untransferred',
        workDay: dayOffset(-10),
        amountCents: 25000,
      }),
      createMockWorkLogEntry({ id: 'paid', status: 'Paid', workDay: dayOffset(-15), amountCents: 60000 }),
      createMockWorkLogEntry({ id: 'pending', status: 'Pending Approval', workDay: dayOffset(-8), amountCents: 10000 }),
    ];

    renderPage();

    const availableTitle = screen.getByText('Available now');
    const availableCard = availableTitle.closest('.MuiCard-root')!;
    expect(availableCard).toHaveTextContent('$250.00');
    expect(availableCard).not.toHaveTextContent('$600.00');
    expect(availableCard).not.toHaveTextContent('$850.00');
    expect(availableCard).not.toHaveTextContent('$950.00');
  });

  it('renders Upcoming releases table with release date and time under it, not grouping on date', () => {
    const today = new Date();
    // 2 entries created 5 days ago, so funds release 2 days from now at different times
    const d1 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 5, 14, 30);
    const d2 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 5, 18, 0);

    mockWorkLogsReturn.entries = [
      createMockWorkLogEntry({
        id: 'upcoming-1',
        createdAt: d1.toISOString(),
        workDay: dayOffset(-5),
        amountCents: 3500,
        status: 'Pending Approval',
      }),
      createMockWorkLogEntry({
        id: 'upcoming-2',
        createdAt: d2.toISOString(),
        workDay: dayOffset(-5),
        amountCents: 4500,
        status: 'Pending Approval',
      }),
      createMockWorkLogEntry({
        id: 'already-paid',
        createdAt: d1.toISOString(),
        workDay: dayOffset(-5),
        amountCents: 10000,
        status: 'Paid',
      }),
      createMockWorkLogEntry({
        id: 'already-untransferred',
        createdAt: d1.toISOString(),
        workDay: dayOffset(-5),
        amountCents: 5000,
        status: 'Untransferred',
      }),
    ];

    renderPage();

    expect(screen.getByText('Upcoming releases')).toBeInTheDocument();
    const upcomingTable = screen.getByText('Upcoming releases').closest<HTMLElement>('.MuiPaper-root')!;

    // Paid and Untransferred should not be in upcoming releases
    expect(within(upcomingTable).queryByText('$100.00')).not.toBeInTheDocument();
    expect(within(upcomingTable).queryByText('$50.00')).not.toBeInTheDocument();

    // Upcoming releases should show $35.00 and $45.00 (in both Imported and Total columns)
    expect(within(upcomingTable).getAllByText('$35.00').length).toBe(2);
    expect(within(upcomingTable).getAllByText('$45.00').length).toBe(2);

    // Check that both times are rendered under the release date
    expect(within(upcomingTable).getByText('2:30 PM')).toBeInTheDocument();
    expect(within(upcomingTable).getByText('6:00 PM')).toBeInTheDocument();

    // Check that both times are rendered under the release date
    const expectedReleaseDay = dayOffset(2); // 7 days after -5 = +2
    const dateElements = within(upcomingTable).getAllByText(expectedReleaseDay);
    expect(dateElements.length).toBe(2); // Two separate rows, not grouped!
  });

  it('estimates un-imported tracked days from the task rate and labels them', () => {
    mockTaskContext.tasks = [createMockTask({ id: 'task-2', name: 'Rated', hourlyRate: 50 })];
    mockSessionContext.sessions = [stoppedSessionOn(0, 'task-2', 2)];

    renderPage();

    // 2h × $50 = $100 estimated scorecard, and an Estimate source chip.
    expect(screen.getByText('Estimated (not imported)')).toBeInTheDocument();
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Estimate')).toBeInTheDocument();
  });

  it('marks imported days as actual in the reconciliation table', () => {
    mockWorkLogsReturn.entries = [
      createMockWorkLogEntry({ workDay: dayOffset(-1), amountCents: 7500, timeInMinutes: 60 }),
    ];

    renderPage();

    expect(screen.getByText('Actual')).toBeInTheDocument();
    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
  });

  describe('reconciliation by month', () => {
    /** Local YYYY-MM-DD for a day in the month `monthOffset` months from now. */
    const dayInMonth = (monthOffset: number, day: number) => {
      const t = new Date();
      return formatDateString(new Date(t.getFullYear(), t.getMonth() + monthOffset, day));
    };
    const monthLabel = (monthOffset: number) => {
      const t = new Date();
      return new Date(t.getFullYear(), t.getMonth() + monthOffset, 1).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
    };

    beforeEach(() => {
      mockWorkLogsReturn.entries = [
        createMockWorkLogEntry({ id: 'this-month', workDay: dayInMonth(0, 1), amountCents: 7500, timeInMinutes: 60 }),
        createMockWorkLogEntry({
          id: 'last-month-a',
          workDay: dayInMonth(-1, 10),
          amountCents: 4000,
          timeInMinutes: 30,
        }),
        createMockWorkLogEntry({
          id: 'last-month-b',
          workDay: dayInMonth(-1, 20),
          amountCents: 6000,
          timeInMinutes: 90,
        }),
      ];
    });

    it('opens the current month and totals each month', () => {
      renderPage();

      expect(screen.getByRole('button', { name: `Hide ${monthLabel(0)}` })).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByRole('button', { name: `Show ${monthLabel(-1)}` })).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByText(dayInMonth(0, 1))).toBeInTheDocument();
      expect(screen.queryByText(dayInMonth(-1, 10))).not.toBeInTheDocument();
      // Last month's header: 30m + 1h 30m reported, $40 + $60
      const lastMonthRow = screen.getByRole('button', { name: `Show ${monthLabel(-1)}` }).closest('tr')!;
      expect(within(lastMonthRow).getByText('$100.00')).toBeInTheDocument();
      expect(within(lastMonthRow).getByText('2h 0m')).toBeInTheDocument();
    });

    it('shows and hides a month on click', () => {
      renderPage();

      fireEvent.click(screen.getByRole('button', { name: `Show ${monthLabel(-1)}` }));
      expect(screen.getByText(dayInMonth(-1, 10))).toBeInTheDocument();
      expect(screen.getByText(dayInMonth(-1, 20))).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: `Hide ${monthLabel(0)}` }));
      expect(screen.queryByText(dayInMonth(0, 1))).not.toBeInTheDocument();
    });

    it('opens the newest month when this month has nothing yet', () => {
      mockWorkLogsReturn.entries = mockWorkLogsReturn.entries.filter(e => e.id !== 'this-month');
      renderPage();

      expect(screen.getByRole('button', { name: `Hide ${monthLabel(-1)}` })).toBeInTheDocument();
      expect(screen.getByText(dayInMonth(-1, 10))).toBeInTheDocument();
    });
  });

  it('shows the empty state and opens the import dialog', async () => {
    renderPage();

    expect(screen.getByText('No payout data yet')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /import work logs/i })[0]);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('surfaces a persistent load warning', () => {
    mockWorkLogsReturn.loadWarning = '2 saved work-log record(s) could not be read';
    renderPage();
    expect(screen.getByText(/could not be read/)).toBeInTheDocument();
  });

  it('opens the import dialog prefilled from a staged browser capture', async () => {
    const payloadText = '{"workLogs":[],"timedWorkEntries":[]}';
    mockWorkLogsReturn.stagedCapture = {
      payloadText,
      receivedAt: '2026-08-31T12:00:00Z',
      reason: 'unmapped-project',
    };

    renderPage();

    expect(screen.getByText(/project without a task match/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/paste the site's json payload/i)).toHaveValue(payloadText);
  });

  it('dismisses a staged browser capture from the banner', () => {
    mockWorkLogsReturn.stagedCapture = {
      payloadText: '{"workLogs":[]}',
      receivedAt: '2026-08-31T12:00:00Z',
      reason: 'unmapped-project',
    };

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(mockWorkLogsReturn.clearStagedCapture).toHaveBeenCalled();
  });

  it('warns that a link-delivered capture needs review before importing', () => {
    mockWorkLogsReturn.stagedCapture = {
      payloadText: '{"workLogs":[]}',
      receivedAt: '2026-08-31T12:00:00Z',
      reason: 'unverified-link',
    };

    renderPage();

    expect(screen.getByText(/arrived through a taskmint:\/\/ link/)).toBeInTheDocument();
    expect(screen.queryByText(/project without a task match/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument();
  });

  it('shows the capture-server warning when the port could not be bound', async () => {
    fakeBackend().platform.captureStatus.mockResolvedValueOnce({
      running: false,
      port: 43117,
      warning: 'Browser capture server could not start on 127.0.0.1:43117',
    });

    renderPage();

    expect(await screen.findByText(/Browser capture server could not start/)).toBeInTheDocument();
  });

  it('logs a capture-server status it could not read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fakeBackend().platform.captureStatus.mockRejectedValueOnce('no server');

    renderPage();

    await waitFor(() => expect(warn).toHaveBeenCalledWith('Failed to read the capture server status:', 'no server'));
    warn.mockRestore();
  });

  it('asks for no capture-server status where the platform runs none', () => {
    installFakeBackendForTest({ without: ['captureStatus'] });
    renderPage();
    expect(screen.queryByText(/Browser capture server/)).not.toBeInTheDocument();
  });

  it('renders no capture-server alert when the server is healthy', async () => {
    renderPage();
    expect(screen.queryByText(/Browser capture server/)).not.toBeInTheDocument();
  });
  describe('Last import', () => {
    it('says when the work logs were last imported', () => {
      const recent = new Date(Date.now() - 60 * 60 * 1000);
      mockWorkLogsReturn.entries = [
        createMockWorkLogEntry({
          id: 'a',
          workDay: dayOffset(-1),
          updatedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        }),
        createMockWorkLogEntry({ id: 'b', workDay: dayOffset(-1), updatedAt: recent.toISOString() }),
      ];

      renderPage();

      const line = screen.getByText(/^Last import:/);
      expect(line).toHaveTextContent(recent.toLocaleString('en-US', { month: 'short', day: 'numeric' }));
      expect(line).not.toHaveTextContent('visit the payments page');
    });

    it('asks for a refresh once the last import is over 3 days old', () => {
      mockWorkLogsReturn.entries = [
        createMockWorkLogEntry({
          workDay: dayOffset(-6),
          updatedAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
        }),
      ];

      renderPage();

      expect(screen.getByText(/^Last import:/)).toHaveTextContent('visit the payments page to refresh');
    });

    it('is hidden with no imported work logs', () => {
      renderPage();
      expect(screen.queryByText(/^Last import:/)).not.toBeInTheDocument();
    });
  });

  describe('Project mappings', () => {
    it('moves a project to another task, past imported days included', async () => {
      mockTaskContext.tasks = [
        createMockTask({ id: 'task-1', name: 'Test Task' }),
        createMockTask({ id: 'task-2', name: 'Other Task' }),
      ];
      mockWorkLogsReturn.entries = [createMockWorkLogEntry({ workDay: dayOffset(-2) })];
      mockWorkLogsReturn.mappings = [createMockProjectTaskMapping()];
      vi.mocked(mockWorkLogsReturn.applyImport).mockResolvedValue({
        entriesAdded: 0,
        entriesUpdated: 1,
        mappingsSaved: 1,
        groupsApplied: [],
        groupsSkipped: [],
        undo: createEmptyImportUndo(),
      });

      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Show project mappings' }));
      await userEvent.click(screen.getByRole('combobox', { name: 'Task for Test Project' }));
      await userEvent.click(screen.getByRole('option', { name: 'Other Task' }));

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Move "Test Project" to "Other Task"?');
      expect(dialog).toHaveTextContent('1 imported entry from "Test Project" moves to "Other Task"');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Move' }));

      expect(mockWorkLogsReturn.applyImport).toHaveBeenCalledWith(
        expect.objectContaining({
          isRemap: true,
          entries: [expect.objectContaining({ id: 'worklog-entry-1', taskId: 'task-2', taskName: 'Other Task' })],
          mappings: [expect.objectContaining({ projectId: 'project-1', taskId: 'task-2' })],
        })
      );
      expect(await screen.findByText('"Test Project" now goes to "Other Task".')).toBeInTheDocument();
    });
  });

  describe('the page around the import', () => {
    // An entry from a project no task matches yet
    const payload = JSON.stringify({
      timedWorkEntries: [
        {
          type: 'TimedWorkEntry',
          id: 'entry-1',
          createdAt: '2026-08-26T20:00:00.000Z',
          timeInMinutes: 240,
          reportedTimeInMinutes: null,
          status: 'Pending Approval',
          amountInCents: 30000,
          project: { id: 'proj-1', name: 'Raccoon - SWE', hasHourlyPrice: true, isDeleted: false },
        },
      ],
    });
    const summary = {
      entriesAdded: 1,
      entriesUpdated: 0,
      mappingsSaved: 1,
      groupsApplied: [],
      groupsSkipped: [],
      undo: createEmptyImportUndo(),
    };
    const openImport = async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /import work logs/i }).at(-1)!);
      const dialog = await screen.findByRole('dialog');
      fireEvent.change(within(dialog).getByLabelText(/paste the site's json payload/i), { target: { value: payload } });
      return dialog;
    };

    it('counts a running timer toward today, second by second', () => {
      // The timer starts at 09:00 today, so the clock reads noon: before 09:00
      // it hadn't started yet. Only Date is faked, so the 1 s tick still runs.
      const today = new Date();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0));
      try {
        const running = stoppedSessionOn(0, 'task-1', 1);
        running.timerInstances[0] = {
          ...running.timerInstances[0],
          state: TimerState.running,
          isRunning: true,
          endTime: undefined,
          duration: undefined,
        };
        mockSessionContext.sessions = [running];
        mockTaskContext.tasks = [createMockTask({ id: 'task-1', name: 'Task task-1', hourlyRate: 60 })];
        renderPage();

        expect(screen.getByText('Daily reconciliation')).toBeInTheDocument();
        expect(screen.getAllByText('Estimate').length).toBeGreaterThan(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('says money is available a day later, for one day', () => {
      mockFundsRelease.days = 1;
      renderPage();
      expect(screen.getByText(/becomes available 1 day later/)).toBeInTheDocument();
    });

    it('shows progress while the first work logs load', () => {
      mockWorkLogsReturn.isLoading = true;
      renderPage();
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('closes the import without importing', async () => {
      renderPage();
      const dialog = await openImport();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it("creates a task for a new project, and says so when it couldn't", async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockAddTask.mockResolvedValueOnce(null).mockResolvedValueOnce(createMockTask({ id: 'new', name: 'Raccoon' }));
      renderPage();
      const dialog = await openImport();
      const create = async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: 'Create New Task' }));
        fireEvent.change(within(dialog).getByLabelText('New Task Name'), { target: { value: 'Raccoon' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Create Task' }));
      };

      await create();
      await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to create new task:', expect.any(Error)));
      // The name is kept for another try
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create Task' }));
      await waitFor(() => expect(mockAddTask).toHaveBeenCalledTimes(2));
      // The task picker comes back once the new task is in, a render later
      expect(await within(dialog).findByRole('combobox', { name: /^Task/ })).toHaveTextContent('Raccoon');
      error.mockRestore();
    });

    it("retires a staged capture once it's applied, and leaves the task's rate alone", async () => {
      mockTaskContext.tasks = [createMockTask({ id: 'task-1', name: 'Raccoon - SWE', hourlyRate: 125 })];
      vi.mocked(mockWorkLogsReturn.applyImport).mockResolvedValueOnce(null).mockResolvedValueOnce(summary);
      renderPage();
      const dialog = await openImport();
      const apply = within(dialog).getByRole('button', { name: /apply import/i });

      fireEvent.click(apply);
      await waitFor(() => expect(mockWorkLogsReturn.applyImport).toHaveBeenCalledTimes(1));
      expect(mockWorkLogsReturn.clearStagedCapture).not.toHaveBeenCalled();

      await waitFor(() => expect(apply).toBeEnabled());
      fireEvent.click(apply);
      await waitFor(() => expect(mockWorkLogsReturn.clearStagedCapture).toHaveBeenCalled());
      // The site paid $75/hr for this day; the task keeps the $125 you set
      expect(mockUpdateTask).not.toHaveBeenCalled();

      // The import's notice can undo it, as a delete's can
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      const notice = await screen.findByText('1 new, 0 updated, 0 days rewritten.');
      fireEvent.click(within(notice.closest('[role="status"]') as HTMLElement).getByRole('button', { name: 'Undo' }));
      await waitFor(() => expect(mockWorkLogsReturn.undoImport).toHaveBeenCalledWith(summary.undo));
    });
  });
});
