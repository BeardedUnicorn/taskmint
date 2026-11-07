import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { NotesList } from '../NotesList';
import { TaskNote } from '../../../../types/notes';

const templates = vi.hoisted(() => ({ byId: {} as Record<string, unknown> }));
vi.mock('../../../../hooks/useNoteTemplates', () => ({
  useNoteTemplates: () => ({ getTemplateById: (id: string) => templates.byId[id] }),
}));

const note = (id: string, updatedAt: string, overrides: Partial<TaskNote> = {}): TaskNote => ({
  id,
  taskId: 'task1',
  templateId: 'free-form',
  templateName: 'Free-form Note',
  fieldValues: { content: `Note ${id}` },
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt,
  ...overrides,
});

const handlers = { onEditNote: vi.fn(), onDeleteNote: vi.fn(), onArchiveNote: vi.fn(), onUnarchiveNote: vi.fn() };

describe('NotesList', () => {
  it('lists notes most recently changed first', () => {
    render(
      <NotesList
        {...handlers}
        notes={[
          note('old', '2026-10-01T00:00:00Z'),
          note('new', '2026-10-10T00:00:00Z'),
          note('mid', '2026-10-05T00:00:00Z'),
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /All/ }));

    // (Each note's text is in its preview and its collapsed details)
    const previews = [...new Set(screen.getAllByText(/^Note /).map(el => el.textContent))];
    expect(previews).toEqual(['Note new', 'Note mid', 'Note old']);
  });

  it('groups by level, task notes first', () => {
    render(
      <NotesList
        {...handlers}
        notes={[
          note('t', '2026-10-01T00:00:00Z', { noteLevel: 'timer' }),
          note('k', '2026-10-01T00:00:00Z', { noteLevel: 'task' }),
        ]}
      />
    );

    const headings = screen.getAllByText(/^(Task|Session|Timer) Notes/).map(el => el.textContent);
    expect(headings).toEqual(['Task Notes (1)', 'Timer Notes (1)']);
  });

  it('offers Add Note only where the list is the place to add from', () => {
    const { rerender } = render(<NotesList {...handlers} notes={[note('a', '2026-10-01T00:00:00Z')]} />);
    expect(screen.queryByRole('button', { name: 'Add Note' })).not.toBeInTheDocument();

    const onCreateNote = vi.fn();
    rerender(<NotesList {...handlers} onCreateNote={onCreateNote} notes={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Note' }));
    expect(onCreateNote).toHaveBeenCalled();
  });

  it('heads the list with its title and count', () => {
    render(<NotesList {...handlers} title="Archived" notes={[note('a', '2026-10-01T00:00:00Z')]} />);
    expect(screen.getByText('Archived (1)')).toBeInTheDocument();
  });

  it('expands a note once per click on its expand button', () => {
    render(<NotesList {...handlers} notes={[note('a', '2026-10-01T00:00:00Z')]} />);
    const expand = screen.getByRole('button', { name: 'Expand note' });

    fireEvent.click(expand);

    expect(screen.getByRole('button', { name: 'Collapse note' })).toHaveAttribute('aria-expanded', 'true');
    const details = screen.getByText('content:').closest('div')!;
    expect(within(details).getByText('Note a')).toBeInTheDocument();
  });

  it('deletes from the expanded note', () => {
    render(<NotesList {...handlers} notes={[note('a', '2026-10-01T00:00:00Z')]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand note' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(handlers.onDeleteNote).toHaveBeenCalledWith('a');
  });

  it('collapses a level, and opens it again', () => {
    render(<NotesList {...handlers} notes={[note('a', '2026-10-01T00:00:00Z', { noteLevel: 'session' })]} />);

    fireEvent.click(screen.getByText('Session Notes (1)'));
    expect(screen.queryByText('Note a')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand notes' })).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByText('Session Notes (1)'));
    expect(screen.getAllByText('Note a').length).toBeGreaterThan(0);
  });

  it('counts a note without a level as a task note', () => {
    render(<NotesList {...handlers} notes={[note('a', '2026-10-01T00:00:00Z', { noteLevel: undefined })]} />);
    expect(screen.getByText('Task Notes (1)')).toBeInTheDocument();
  });
});

describe('NoteItem', () => {
  const one = (overrides: Partial<TaskNote>, taskNames?: Record<string, string>) =>
    render(<NotesList {...handlers} taskNames={taskNames} notes={[note('a', '2026-10-01T00:00:00Z', overrides)]} />);
  const expand = () => fireEvent.click(screen.getByRole('button', { name: 'Expand note' }));
  const menu = (item: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: item }));
  };

  it('previews a note of checkboxes only, and one with nothing filled in', () => {
    const { unmount } = one({ fieldValues: { done: false } });
    expect(screen.getByText('✗ Unchecked')).toBeInTheDocument();
    unmount();

    const again = one({ fieldValues: { done: true } });
    expect(screen.getByText('✓ Checked')).toBeInTheDocument();
    again.unmount();

    one({ fieldValues: { content: '' } });
    expect(screen.getByText('No content')).toBeInTheDocument();
  });

  it("shows each filled field by its template's label, yes/no for checkboxes, and data as data", () => {
    templates.byId.standup = {
      id: 'standup',
      fields: [
        { id: 'done', label: 'Done?', type: 'checkbox' },
        { id: 'blockers', label: 'Blockers', type: 'text' },
      ],
    };
    one({
      templateId: 'standup',
      fieldValues: { done: true, skipped: false, blockers: 'None', legacy: { a: 1 }, empty: '' },
    });
    expand();

    expect(screen.getByText('Done?:')).toBeInTheDocument();
    expect(screen.getByText('✓ Yes')).toBeInTheDocument();
    // A field the template no longer has shows by its id
    expect(screen.getByText('skipped:')).toBeInTheDocument();
    expect(screen.getByText('✗ No')).toBeInTheDocument();
    expect(screen.getByText(/"a": 1/)).toBeInTheDocument();
    expect(screen.queryByText('empty:')).not.toBeInTheDocument();
  });

  it("shows the note's task, its links, and that it's archived", () => {
    one(
      {
        timeEntryId: 'e1',
        sessionId: 's1',
        timerInstanceId: 't1',
        isArchived: true,
        createdAt: '2026-09-01T00:00:00Z',
      },
      { task1: 'Annotation' }
    );

    for (const chip of ['Annotation', 'Time Entry', 'Session', 'Timer Instance', 'Archived']) {
      expect(screen.getAllByText(chip).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/• Updated:/)).toBeInTheDocument();
  });

  it('edits from the expanded note, and edits, archives or deletes from its menu', () => {
    one({});
    expand();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    menu('Edit Note');
    menu('Archive Note');
    menu('Delete Note');

    expect(handlers.onEditNote).toHaveBeenCalledTimes(2);
    expect(handlers.onArchiveNote).toHaveBeenCalledWith('a');
    expect(handlers.onDeleteNote).toHaveBeenCalledWith('a');
  });

  it("shows each note's level in the flat list, and opens a note from its row", () => {
    render(
      <NotesList
        {...handlers}
        onCreateNote={vi.fn()}
        notes={[note('a', '2026-10-01T00:00:00Z', { noteLevel: 'timer', fieldValues: { content: 'Row text' } })]}
      />
    );
    expect(screen.getByRole('button', { name: 'Add Note' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Timer')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Row text')[0]);
    expect(screen.getByRole('button', { name: 'Collapse note' })).toBeInTheDocument();
  });

  it('unarchives an archived note from its menu', () => {
    one({ isArchived: true });
    menu('Unarchive Note');
    expect(handlers.onUnarchiveNote).toHaveBeenCalledWith('a');
  });
});
