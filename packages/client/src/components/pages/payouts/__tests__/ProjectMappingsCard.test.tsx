/**
 * ProjectMappingsCard: each project's task, and moving a project to another
 * task once the plan for it (buildRemapPlan, tested on its own) is confirmed.
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectMappingsCard } from '../ProjectMappingsCard';
import { buildRemapPlan } from '../../../../utils/workLogImport';
import type { WorkLogImportPayload, WorkLogImportSummary } from '../../../../types/workLog';
import {
  createMockProjectTaskMapping,
  createMockTask,
  createMockWorkLogEntry,
} from '../../../../__tests__/setup/session-test-utils';
import { createNotificationMock } from '../../../../__tests__/setup/notificationMock';

const notifications = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof createNotificationMock> }));
vi.mock('../../../../contexts/NotificationContext', () => ({ useNotification: () => notifications.current }));
vi.mock('../../../../utils/workLogImport', () => ({ buildRemapPlan: vi.fn() }));

const annotation = createMockTask({ id: 'task-1', name: 'Annotation' });
const review = createMockTask({ id: 'task-2', name: 'Review' });
const retired = createMockTask({ id: 'task-3', name: 'Retired', isArchived: true });

const writing = createMockProjectTaskMapping({ projectId: 'p-writing', projectName: 'Writing', taskId: 'task-1' });
const legacy = createMockProjectTaskMapping({
  projectId: 'p-legacy',
  projectName: 'Legacy',
  taskId: 'task-3',
  taskName: 'Retired',
});
const orphan = createMockProjectTaskMapping({
  projectId: 'p-orphan',
  projectName: 'Orphan',
  taskId: 'gone',
  taskName: 'Gone',
});

const plan = (entries: number, days: string[], replacedTrackedMs = 0) => ({
  entries: Array.from({ length: entries }, (_, i) => createMockWorkLogEntry({ id: `e${i}` })),
  mappings: [writing],
  groups: [],
  days,
  replacedTrackedMs,
});
const summary = (skipped: { workDay: string; reason: string }[] = []): WorkLogImportSummary => ({
  entriesAdded: 0,
  entriesUpdated: 1,
  mappingsSaved: 1,
  groupsApplied: [],
  groupsSkipped: skipped as WorkLogImportSummary['groupsSkipped'],
});

type Apply = (payload: WorkLogImportPayload) => Promise<WorkLogImportSummary | null>;
const card = (onApply: Apply = vi.fn(async () => summary())) => {
  render(
    <ProjectMappingsCard
      mappings={[writing, legacy, orphan]}
      entries={[
        createMockWorkLogEntry({ projectId: 'p-writing' }),
        createMockWorkLogEntry({ id: 'e2', projectId: 'p-writing' }),
      ]}
      sessions={[]}
      tasks={[annotation, review, retired]}
      onApply={onApply}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Show project mappings' }));
  return onApply;
};

const moveWriting = async (to: string) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Task for Writing' }));
  fireEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: to }));
};

beforeEach(() => {
  notifications.current = createNotificationMock();
});

describe('ProjectMappingsCard', () => {
  it('shows nothing without mappings', () => {
    const { container } = render(
      <ProjectMappingsCard mappings={[]} entries={[]} sessions={[]} tasks={[]} onApply={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each project by name with its entries, and folds away', async () => {
    card();
    const [legacyRow, orphanRow, writingRow] = screen.getAllByRole('row').slice(1);
    expect(within(writingRow).getByText('2')).toBeInTheDocument();
    expect(within(orphanRow).getByText('0')).toBeInTheDocument();
    expect(within(legacyRow).getByRole('combobox')).toHaveTextContent('Retired');
    expect(within(orphanRow).getByRole('combobox')).toHaveTextContent('Gone (deleted)');

    // Archived tasks aren't offered, except where they're already mapped
    fireEvent.mouseDown(within(writingRow).getByRole('combobox'));
    expect(
      within(await screen.findByRole('listbox')).queryByRole('option', { name: 'Retired' })
    ).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });

    fireEvent.click(screen.getByRole('button', { name: 'Hide project mappings' }));
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument());
  });

  it("says why a project can't move", async () => {
    vi.mocked(buildRemapPlan).mockReturnValue({ error: 'A timer is running on 2026-10-01' });
    card();
    await moveWriting('Review');
    expect(notifications.current.showError).toHaveBeenCalledWith('A timer is running on 2026-10-01');
  });

  it('moves one entry and rebuilds one day once confirmed', async () => {
    vi.mocked(buildRemapPlan).mockReturnValue(plan(1, ['2026-10-01']));
    const onApply = card();
    await moveWriting('Review');

    expect(
      screen.getByText('1 imported entry from "Writing" moves to "Review", and 1 day is rebuilt (2026-10-01).')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));

    await waitFor(() =>
      expect(notifications.current.showSuccess).toHaveBeenCalledWith('"Writing" now goes to "Review".', {
        category: 'workLog',
      })
    );
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ isRemap: true }));
  });

  it('says what tracked time is replaced, and which days were skipped', async () => {
    vi.mocked(buildRemapPlan).mockReturnValue(plan(2, ['2026-10-01', '2026-10-02'], 1_800_000));
    card(vi.fn(async () => summary([{ workDay: '2026-10-02', reason: 'a timer is running' }])));
    await moveWriting('Review');

    expect(
      screen.getByText(/2 imported entries from "Writing" move to "Review", and 2 days are rebuilt/)
    ).toBeInTheDocument();
    expect(screen.getByText(/The \S+( \S+)? you tracked on "Review" those days is replaced/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));

    await waitFor(() =>
      expect(notifications.current.showWarning).toHaveBeenCalledWith(
        "Some days weren't moved: 2026-10-02 (a timer is running)",
        { category: 'workLog', duration: null }
      )
    );
  });

  it('says nothing more when the move fails (it reported why), or when it is cancelled', async () => {
    vi.mocked(buildRemapPlan).mockReturnValue(plan(0, []));
    const onApply = card(vi.fn(async () => null));
    await moveWriting('Review');

    expect(
      screen.getByText('0 imported entries from "Writing" move to "Review", and 0 days are rebuilt.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(notifications.current.showSuccess).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await moveWriting('Review');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});
