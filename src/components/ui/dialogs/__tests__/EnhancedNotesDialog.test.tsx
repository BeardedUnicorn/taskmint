import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi, describe, it, expect } from 'vitest';
import { EnhancedNotesDialog } from '../EnhancedNotesDialog';

// Mock hooks
vi.mock('../../../../hooks/useTaskNotes', () => ({
  useTaskNotes: vi.fn(() => ({
    notes: [],
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    getNotesBySessionId: vi.fn(() => [
      {
        id: 'note1',
        taskId: 'task1',
        templateId: 'tmpl1',
        templateName: 'Template',
        fieldValues: {},
        sessionId: 'session1',
        timerInstanceId: 'timer1',
        noteLevel: 'timer',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ]),
    getNotesByTimerInstanceId: vi.fn(() => []),
  })),
}));

vi.mock('../../../../hooks/useNoteTemplates', () => ({
  useNoteTemplates: vi.fn(() => ({
    getTemplateById: vi.fn(),
    getActiveTemplates: vi.fn(() => []),
  })),
}));

vi.mock('../../../../contexts/NotificationContext', () => ({
  useNotification: () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
  }),
}));

describe('EnhancedNotesDialog', () => {
  it('shows timer notes tab when session has timer notes', async () => {
    render(
      <EnhancedNotesDialog
        open
        onClose={() => {}}
        activeSessionId="session1"
        activeTaskId="task1"
      />
    );

    await waitFor(() => {
      expect(
        screen.getByRole('tab', { name: /timer note/i })
      ).toBeInTheDocument();
    });
  });
});

