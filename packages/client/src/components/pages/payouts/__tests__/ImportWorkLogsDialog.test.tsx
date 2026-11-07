/**
 * ImportWorkLogsDialog tests: parse gating, mapping resolution, preview, and
 * the payload handed to onApply.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '../../../../__tests__/setup/test-helpers';
import { ImportWorkLogsDialog } from '../ImportWorkLogsDialog';
import { WORKLOG_IMPORT_SOURCE, WorkLogImportPayload, WorkLogImportSummary } from '../../../../types/workLog';
import { deriveTimedWorkDay } from '../../../../utils/workLogImport';
import { createMockTask, createMockTaskSession, createMockTimerInstance } from '../../../../__tests__/setup/session-test-utils';
import { TimerState } from '../../../../types/timer';

const emptySummary: WorkLogImportSummary = {
  entriesAdded: 1,
  entriesUpdated: 0,
  mappingsSaved: 1,
  groupsApplied: [],
  groupsSkipped: [],
};

const CREATED_AT = '2026-08-26T20:00:00.000Z';

const samplePayload = JSON.stringify({
  timedWorkEntries: [
    {
      type: 'TimedWorkEntry',
      id: 'entry-1',
      createdAt: CREATED_AT,
      timeInMinutes: 240,
      reportedTimeInMinutes: null,
      status: 'Pending Approval',
      amountInCents: 30000,
      project: { id: 'proj-1', name: 'Raccoon - SWE', hasHourlyPrice: true, isDeleted: false },
    },
  ],
});

function renderDialog(overrides: Partial<Parameters<typeof ImportWorkLogsDialog>[0]> = {}) {
  const onApply = vi.fn(async (_payload: WorkLogImportPayload) => emptySummary);
  const props = {
    onClose: vi.fn(),
    existingEntries: [],
    existingMappings: [],
    sessions: [],
    tasks: [createMockTask({ id: 'task-1', name: 'Raccoon - SWE' })],
    onApply,
    onCreateTask: vi.fn(async (name: string) => createMockTask({ id: 'new-task', name })),
    ...overrides,
  };
  const utils = render(<ImportWorkLogsDialog {...props} />);
  return { ...utils, props };
}

function pasteText(value: string) {
  fireEvent.change(screen.getByLabelText(/paste the site's json payload/i), {
    target: { value },
  });
}

describe('ImportWorkLogsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables Apply and shows an error for invalid JSON', () => {
    renderDialog();
    pasteText('{not json');
    expect(screen.getByText('Not valid JSON')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply import/i })).toBeDisabled();
  });

  it('previews an auto-matched paste and applies with entries, mappings, and groups', async () => {
    const { props } = renderDialog();
    pasteText(samplePayload);

    const workDay = deriveTimedWorkDay(CREATED_AT, 240);
    expect(screen.getByText(workDay)).toBeInTheDocument();
    expect(screen.getByText('$300.00')).toBeInTheDocument();
    // Project name matches the task name, so no mapping prompt appears.
    expect(screen.queryByText(/match site projects to tasks/i)).not.toBeInTheDocument();

    const applyButton = screen.getByRole('button', { name: /apply import/i });
    expect(applyButton).toBeEnabled();
    fireEvent.click(applyButton);

    await waitFor(() => expect(props.onApply).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(props.onApply).mock.calls[0][0] as WorkLogImportPayload;
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0]).toMatchObject({
      id: 'entry-1',
      taskId: 'task-1',
      workDay,
      amountCents: 30000,
    });
    expect(payload.mappings).toEqual([
      expect.objectContaining({ projectId: 'proj-1', taskId: 'task-1' }),
    ]);
    expect(payload.rewriteGroups).toHaveLength(1);
    expect(payload.rewriteGroups[0]).toMatchObject({ taskId: 'task-1', workDay });
    expect(payload.rewriteGroups[0].replacementSession!.timerInstances).toHaveLength(1);

    expect(await screen.findByText(/1 day was rewritten|0 days were rewritten/)).toBeInTheDocument();
  });

  it('prompts for unmapped projects and gates Apply until resolved', () => {
    renderDialog({ tasks: [createMockTask({ id: 'other', name: 'Unrelated Task' })] });
    pasteText(samplePayload);

    expect(screen.getByText(/match site projects to tasks/i)).toBeInTheDocument();
    expect(screen.getByText('Raccoon - SWE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply import/i })).toBeDisabled();
  });

  it('asks for a task for a referral bonus instead of skipping it', async () => {
    const referralPayload = JSON.stringify({
      workLogs: [
        {
          type: 'ReferralWorkLog',
          id: 'ref-1',
          amountInCents: 10000,
          createdAt: CREATED_AT,
          status: 'Pending Approval',
        },
      ],
    });
    const referrals = createMockTask({ id: 'task-ref', name: 'Referrals' });
    const { props } = renderDialog({ tasks: [referrals] });
    pasteText(referralPayload);

    expect(screen.queryByText(/could not be read/i)).not.toBeInTheDocument();
    expect(screen.getByText(/match site projects to tasks/i)).toBeInTheDocument();
    expect(screen.getByText('Referral bonus')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply import/i })).toBeDisabled();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Referrals' } });
    fireEvent.click(await screen.findByRole('option', { name: 'Referrals' }));
    expect(screen.getByText('$100.00')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /apply import/i }));
    await waitFor(() => expect(props.onApply).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(props.onApply).mock.calls[0][0] as WorkLogImportPayload;
    expect(payload.entries).toEqual([
      expect.objectContaining({ id: 'ref-1', kind: 'workLog', taskId: 'task-ref', amountCents: 10000 }),
    ]);
    expect(payload.mappings).toEqual([
      expect.objectContaining({ projectId: 'site-type:ReferralWorkLog', taskId: 'task-ref' }),
    ]);
    expect(payload.rewriteGroups).toEqual([]);
  });

  it('shows backend skip reasons in the result view', async () => {
    const summary: WorkLogImportSummary = {
      ...emptySummary,
      groupsSkipped: [
        {
          taskId: 'task-1',
          workDay: '2026-08-26',
          reason: 'a timer is running or paused on 2026-08-26; stop it first, then re-import',
        },
      ],
    };
    const { props } = renderDialog({ onApply: vi.fn(async () => summary) });
    pasteText(samplePayload);
    fireEvent.click(screen.getByRole('button', { name: /apply import/i }));

    await waitFor(() => expect(props.onApply).toHaveBeenCalled());
    expect(await screen.findByText(/stop it first, then re-import/)).toBeInTheDocument();
  });

  it("offers no task-rate change, whatever the site's pay implies", () => {
    // 30000 cents over 240 minutes is $75/hr; the task is set to $60
    renderDialog({ tasks: [createMockTask({ id: 'task-1', name: 'Raccoon - SWE', hourlyRate: 60 })] });
    pasteText(samplePayload);
    expect(screen.getByRole('button', { name: /apply import/i })).toBeEnabled();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText(/\/hr/)).not.toBeInTheDocument();
  });

  it('prefills from initialText and previews without any typing', () => {
    renderDialog({ initialText: samplePayload });

    expect(screen.getByLabelText(/paste the site's json payload/i)).toHaveValue(samplePayload);
    expect(screen.getByText(deriveTimedWorkDay(CREATED_AT, 240))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply import/i })).toBeEnabled();
  });

  it('opens with an empty paste box again once closed (the page mounts it while open)', () => {
    const { unmount } = renderDialog({ initialText: samplePayload });
    expect(screen.getByLabelText(/paste the site's json payload/i)).toHaveValue(samplePayload);

    unmount();
    renderDialog();
    expect(screen.getByLabelText(/paste the site's json payload/i)).toHaveValue('');
  });

  it("keeps what's showing when the staged capture changes while it's open", () => {
    const { rerender, props } = renderDialog({ initialText: samplePayload });
    rerender(<ImportWorkLogsDialog {...props} initialText={undefined} />);
    expect(screen.getByLabelText(/paste the site's json payload/i)).toHaveValue(samplePayload);
  });

  describe('the preview and the result', () => {
    // The imported entry: 4h ending at CREATED_AT, on its local day
    const end = new Date(CREATED_AT);
    const start = new Date(end.getTime() - 240 * 60_000);
    const tracked = (minutes: number, overrides = {}) =>
      createMockTaskSession({
        id: 's1',
        taskId: 'task-1',
        taskName: 'Raccoon - SWE',
        timerInstances: [
          createMockTimerInstance({
            id: 'i1',
            sessionId: 's1',
            startTime: start.toISOString(),
            endTime: new Date(start.getTime() + minutes * 60_000).toISOString(),
            duration: minutes * 60_000,
            ...overrides,
          }),
        ],
      });
    const row = () => screen.getByText(deriveTimedWorkDay(CREATED_AT, 240)).closest('tr')!;

    it('shows no difference when the day already has the same time tracked', () => {
      renderDialog({ sessions: [tracked(240)] });
      pasteText(samplePayload);
      expect(row()).toHaveTextContent('±0m');
    });

    it('shows less imported than tracked as a negative difference', () => {
      renderDialog({ sessions: [tracked(300)] });
      pasteText(samplePayload);
      expect(row()).toHaveTextContent('−1h 0m');
    });

    it('warns that a day with a live timer is skipped', () => {
      renderDialog({
        sessions: [
          tracked(0, {
            state: TimerState.running,
            isRunning: true,
            endTime: undefined,
            duration: undefined,
          }),
        ],
      });
      pasteText(samplePayload);
      expect(screen.getByText(/1 day will be skipped while a timer is active/)).toBeInTheDocument();
    });

    it('marks a day imported before as overwritten', () => {
      // Imported days are their session's date
      const imported = { ...tracked(120), source: WORKLOG_IMPORT_SOURCE, date: deriveTimedWorkDay(CREATED_AT, 240) };
      renderDialog({ sessions: [imported] });
      pasteText(samplePayload);
      expect(screen.getByText('overwrites previous import')).toBeInTheDocument();
    });

    it('counts each day a live or paused timer blocks', () => {
      const nextDay = new Date(new Date(CREATED_AT).getTime() + 24 * 60 * 60_000).toISOString();
      const twoDays = JSON.stringify({
        timedWorkEntries: [
          JSON.parse(samplePayload).timedWorkEntries[0],
          { ...JSON.parse(samplePayload).timedWorkEntries[0], id: 'entry-2', createdAt: nextDay },
        ],
      });
      const live = (id: string, at: string, state: TimerState) =>
        createMockTaskSession({
          id,
          taskId: 'task-1',
          taskName: 'Raccoon - SWE',
          timerInstances: [
            createMockTimerInstance({
              id: `${id}-i`,
              sessionId: id,
              startTime: new Date(new Date(at).getTime() - 60 * 60_000).toISOString(),
              state,
              isRunning: state === TimerState.running,
              isPaused: state === TimerState.paused,
              endTime: undefined,
              duration: undefined,
            }),
          ],
        });
      renderDialog({
        sessions: [live('a', CREATED_AT, TimerState.running), live('b', nextDay, TimerState.paused)],
      });
      pasteText(twoDays);
      expect(screen.getByText(/2 days will be skipped while a timer is active/)).toBeInTheDocument();
    });

    it("says how many records it couldn't read", () => {
      renderDialog();
      const records = (count: number) =>
        JSON.stringify({ timedWorkEntries: Array.from({ length: count }, (_, i) => ({ type: 'TimedWorkEntry', id: `bad-${i}` })) });

      pasteText(records(1));
      expect(screen.getByText(/1 record could not be read/)).toBeInTheDocument();
      pasteText(records(2));
      expect(screen.getByText(/2 records could not be read/)).toBeInTheDocument();
    });


    it('stays on the preview when the import fails (the hook said why)', async () => {
      const { props } = renderDialog({ onApply: vi.fn(async () => null) });
      pasteText(samplePayload);
      fireEvent.click(screen.getByRole('button', { name: /apply import/i }));

      await waitFor(() => expect(props.onApply).toHaveBeenCalled());
      expect(screen.getByRole('button', { name: /apply import/i })).toBeEnabled();
    });

    it('counts several entries and one rewritten day', async () => {
      const summary = {
        ...emptySummary,
        entriesAdded: 1,
        entriesUpdated: 1,
        groupsApplied: [{ taskId: 'task-1', workDay: '2026-08-26' }],
      } as unknown as WorkLogImportSummary;
      renderDialog({ onApply: vi.fn(async () => summary) });
      pasteText(samplePayload);
      fireEvent.click(screen.getByRole('button', { name: /apply import/i }));

      expect(await screen.findByText(/existing entries; 1 day was rewritten/)).toBeInTheDocument();
    });

    it('keeps a typed name that is no task as unresolved', () => {
      renderDialog({ tasks: [createMockTask({ id: 'other', name: 'Unrelated Task' })] });
      pasteText(samplePayload);

      fireEvent.change(screen.getByRole('combobox', { name: 'Task' }), { target: { value: 'Not a task' } });
      expect(screen.getByRole('button', { name: /apply import/i })).toBeDisabled();
    });
  });
});
