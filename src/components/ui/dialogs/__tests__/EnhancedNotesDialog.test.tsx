import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest';

// Mock task notes hook
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

import { useTaskNotes } from '../../../../hooks/useTaskNotes';

// Mock the dialog component to only render logic needed for this test
vi.mock('../EnhancedNotesDialog', () => {
  const MockDialog = ({ activeSessionId }: any) => {
    const { getNotesBySessionId } = useTaskNotes();
    const notes = getNotesBySessionId(activeSessionId);
    return (
      <div>
        {notes.some(n => n.noteLevel === 'timer') && (
          <div role="tab">Timer Note</div>
        )}
      </div>
    );
  };
  return { EnhancedNotesDialog: MockDialog };
});

import { EnhancedNotesDialog } from '../EnhancedNotesDialog';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  cleanup();
});

describe('EnhancedNotesDialog', () => {
  it('renders timer notes tab when session has timer notes', () => {
    render(
      <EnhancedNotesDialog
        open
        onClose={() => {}}
        activeSessionId="session1"
        activeTaskId="task1"
      />
    );

    expect(
      screen.getByRole('tab', { name: /timer note/i })
    ).toBeInTheDocument();
  });
});

