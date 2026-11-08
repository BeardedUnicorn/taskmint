/**
 * The Notes page on the real notes and templates providers and components:
 * filtering by task and template, the archived section, and editing.
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotesPage } from '../NotesPage';
import { TaskNotesProvider } from '../../../contexts/TaskNotesContext';
import { NoteTemplatesProvider } from '../../../contexts/NoteTemplatesContext';
import { TaskNote } from '../../../types/notes';
import { Task } from '../../../types/task';
import { readAppRecord } from '../../../services/appRecords';
import { seedAppRecords } from '../../../testing';
import { createMockTask } from '../../../__tests__/setup/session-test-utils';
import { createNotificationMock } from '../../../__tests__/setup/notificationMock';

vi.mock('../../../contexts/NotificationContext', () => ({ useNotification: () => createNotificationMock() }));

const annotation = createMockTask({ id: 'task-1', name: 'Annotation' });
const retired = createMockTask({ id: 'task-2', name: 'Retired', isArchived: true });

const note = (id: string, overrides: Partial<TaskNote> = {}): TaskNote => ({
  id,
  taskId: 'task-1',
  templateId: 'free-form',
  templateName: 'Free-form Note',
  fieldValues: { content: `Text of ${id}` },
  noteLevel: 'task',
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...overrides,
});

const standup = {
  id: 'standup',
  name: 'Standup',
  fields: [{ id: 'done', label: 'Done', type: 'text', required: false, order: 0 }],
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const page = (tasks: Task[] = [annotation, retired]) =>
  render(
    <TaskNotesProvider>
      <NoteTemplatesProvider>
        <NotesPage tasks={tasks} sessions={[]} runningTask={null} />
      </NoteTemplatesProvider>
    </TaskNotesProvider>
  );

const choose = async (filter: string, option: string) => {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: filter }));
  fireEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: option }));
};
const shown = (text: string) => screen.queryAllByText(text).length > 0;

beforeEach(() => {
  seedAppRecords({
    taskNotes: [
      note('free'),
      note('templated', {
        taskId: 'task-2',
        templateId: 'standup',
        templateName: 'Standup',
        fieldValues: { done: 'Shipped' },
      }),
      note('archived', { isArchived: true }),
    ],
    noteTemplates: [standup],
  });
});

describe('NotesPage, for real', () => {
  it('filters by task and by template, and lists archived notes apart', async () => {
    page();
    await waitFor(() => expect(shown('Text of free')).toBe(true));
    expect(screen.getAllByText(/^Archived/).length).toBeGreaterThan(1);

    await choose('Filter by Task', 'Retired');
    expect(shown('Text of free')).toBe(false);
    expect(shown('Shipped')).toBe(true);

    await choose('Filter by Task', 'All Tasks');
    await choose('Filter by Template', 'Standup');
    expect(shown('Text of free')).toBe(false);
    expect(shown('Text of archived')).toBe(false);
  });

  it("edits a note on an archived task, collapsing and closing the editor when it's deleted", async () => {
    page();
    await waitFor(() => expect(shown('Shipped')).toBe(true));

    const card = screen.getAllByText('Shipped')[0].closest('.MuiPaper-root') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit Note' }));

    // Its archived task is listed so the note can stay on it
    expect(await screen.findByRole('combobox', { name: 'Task' })).toHaveTextContent('Retired');
    fireEvent.click(screen.getAllByRole('button', { name: 'Collapse notes' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Expand notes' }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete Note' }));
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Task' })).not.toBeInTheDocument());
    expect((readAppRecord('taskNotes') as TaskNote[]).map(saved => saved.id)).not.toContain('templated');
  });

  it('waits for a task before a new note can be added', async () => {
    page([retired]);
    expect(await screen.findByRole('button', { name: /Add Note/ })).toBeDisabled();
  });
});
