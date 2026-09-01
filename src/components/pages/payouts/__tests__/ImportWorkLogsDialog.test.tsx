/**
 * ImportWorkLogsDialog tests: parse gating, mapping resolution, preview, and
 * the payload handed to onApply.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '../../../../__tests__/setup/test-helpers';
import { ImportWorkLogsDialog } from '../ImportWorkLogsDialog';
import { WorkLogImportPayload, WorkLogImportSummary } from '../../../../types/workLog';
import { deriveTimedWorkDay } from '../../../../utils/workLogImport';
import { createMockTask } from '../../../../__tests__/setup/session-test-utils';

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
    open: true,
    onClose: vi.fn(),
    existingEntries: [],
    existingMappings: [],
    sessions: [],
    tasks: [createMockTask({ id: 'task-1', name: 'Raccoon - SWE' })],
    onApply,
    onCreateTask: vi.fn(async (name: string) => createMockTask({ id: 'new-task', name })),
    onUpdateTaskRate: vi.fn(async () => null),
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
    const payload = props.onApply.mock.calls[0][0] as WorkLogImportPayload;
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
    expect(payload.rewriteGroups[0].replacementSession.timerInstances).toHaveLength(1);

    expect(await screen.findByText(/1 day was rewritten|0 days were rewritten/)).toBeInTheDocument();
  });

  it('prompts for unmapped projects and gates Apply until resolved', () => {
    renderDialog({ tasks: [createMockTask({ id: 'other', name: 'Unrelated Task' })] });
    pasteText(samplePayload);

    expect(screen.getByText(/match site projects to tasks/i)).toBeInTheDocument();
    expect(screen.getByText('Raccoon - SWE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply import/i })).toBeDisabled();
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

  it('offers the implied-rate update with the computed rate', () => {
    renderDialog();
    pasteText(samplePayload);
    // 30000 cents over 240 minutes → $75/hr.
    expect(screen.getByText(/update task hourly rates from imported pay/i)).toBeInTheDocument();
    expect(screen.getByText(/\$75\.00\/hr/)).toBeInTheDocument();
  });

  it('prefills from initialText and previews without any typing', () => {
    renderDialog({ initialText: samplePayload });

    expect(screen.getByLabelText(/paste the site's json payload/i)).toHaveValue(samplePayload);
    expect(screen.getByText(deriveTimedWorkDay(CREATED_AT, 240))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply import/i })).toBeEnabled();
  });

  it('resets to an empty paste box when reopened without initialText', () => {
    const { rerender, props } = renderDialog({ initialText: samplePayload });
    expect(screen.getByLabelText(/paste the site's json payload/i)).toHaveValue(samplePayload);

    rerender(<ImportWorkLogsDialog {...props} initialText={undefined} open={false} />);
    rerender(<ImportWorkLogsDialog {...props} initialText={undefined} open={true} />);

    expect(screen.getByLabelText(/paste the site's json payload/i)).toHaveValue('');
  });
});
