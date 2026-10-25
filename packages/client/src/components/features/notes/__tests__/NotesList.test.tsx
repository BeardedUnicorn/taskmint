import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { NotesList } from '../NotesList';
import { TaskNote } from '../../../../types/notes';

vi.mock('../../../../hooks/useNoteTemplates', () => ({
  useNoteTemplates: () => ({ getTemplateById: () => undefined }),
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

const handlers = { onEditNote: vi.fn(), onDeleteNote: vi.fn() };

describe('NotesList', () => {
  it('lists notes most recently changed first', () => {
    render(
      <NotesList
        {...handlers}
        notes={[note('old', '2026-10-01T00:00:00Z'), note('new', '2026-10-10T00:00:00Z'), note('mid', '2026-10-05T00:00:00Z')]}
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
});
