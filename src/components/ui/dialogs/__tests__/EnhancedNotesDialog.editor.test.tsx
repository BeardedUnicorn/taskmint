import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { vi, describe, it, expect } from 'vitest';
import { EnhancedNotesDialog } from '../EnhancedNotesDialog';

// Hook results must be stable across renders, like the real hooks': the
// dialog's load effect depends on them and would otherwise loop.
const noNotes: never[] = [];
const taskNotes = {
  notes: noNotes,
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  getNotesBySessionId: () => noNotes,
  getNotesByTimerInstanceId: () => noNotes,
};
vi.mock('../../../../hooks/useTaskNotes', () => ({
  useTaskNotes: () => taskNotes,
}));

const noteTemplates = {
  getActiveTemplates: () => noNotes,
  getTemplateById: () => undefined,
};
vi.mock('../../../../hooks/useNoteTemplates', () => ({
  useNoteTemplates: () => noteTemplates,
}));

const notifications = { showError: vi.fn(), showSuccess: vi.fn() };
vi.mock('../../../../contexts/NotificationContext', () => ({
  useNotification: () => notifications,
}));

describe('EnhancedNotesDialog editor', () => {
  it('has no Tags field, since tags were never saved', () => {
    render(
      <EnhancedNotesDialog
        open
        onClose={() => {}}
        activeSessionId="session-1"
        activeTaskId="task-1"
        taskName="Annotation"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Session Note' }));

    expect(screen.getByRole('heading', { name: 'Add Session Note' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Tags')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Add tags...')).not.toBeInTheDocument();
  });
});
