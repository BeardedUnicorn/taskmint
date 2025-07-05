/**
 * NoteEditor Copy Functionality Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { NoteEditor } from '../NoteEditor';
import { NoteTemplate, TaskNote } from '../../../../types/notes';

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(),
  },
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue('Command output'),
}));

describe('NoteEditor Copy Functionality', () => {
  const mockTemplate: NoteTemplate = {
    id: 'template1',
    name: 'Test Template',
    fields: [
      {
        id: 'field1',
        label: 'Text Field',
        type: 'text',
        required: false,
        order: 0,
      },
      {
        id: 'field2',
        label: 'Number Field',
        type: 'number',
        required: false,
        order: 1,
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isActive: true,
  };

  const mockExistingNote: TaskNote = {
    id: 'note1',
    taskId: 'task1',
    templateId: 'template1',
    templateName: 'Test Template',
    fieldValues: {
      field1: 'Sample text content',
      field2: '42',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockOnSaveNote = vi.fn().mockResolvedValue({ id: 'note1' });
  const mockOnUpdateNote = vi.fn().mockResolvedValue({});
  const mockOnDeleteNote = vi.fn().mockResolvedValue({});

  beforeEach(() => {
    vi.clearAllMocks();
    (navigator.clipboard.writeText as vi.Mock).mockResolvedValue(undefined);
  });

  it('renders copy buttons for each field', async () => {
    await act(async () => {
      render(
        <NoteEditor
          taskId="task1"
          template={mockTemplate}
          existingNote={mockExistingNote}
          onSaveNote={mockOnSaveNote}
          onUpdateNote={mockOnUpdateNote}
          onDeleteNote={mockOnDeleteNote}
          isCollapsed={false}
          onToggleCollapse={() => {}}
        />
      );
    });

    // Check for copy buttons
    expect(screen.getByTitle('Copy Text Field content')).toBeInTheDocument();
    expect(screen.getByTitle('Copy Number Field content')).toBeInTheDocument();
  });

  it('copies field content to clipboard when copy button is clicked', async () => {
    render(
      <NoteEditor
        taskId="task1"
        template={mockTemplate}
        existingNote={mockExistingNote}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={mockOnUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
      />
    );

    const copyButton = screen.getByTitle('Copy Text Field content');
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Sample text content');
      expect(screen.getByText('Copied Text Field content to clipboard')).toBeInTheDocument();
    });
  });

  it('shows message when trying to copy empty field', async () => {
    const emptyNote: TaskNote = {
      ...mockExistingNote,
      fieldValues: {
        field1: '',
        field2: '',
      },
    };

    render(
      <NoteEditor
        taskId="task1"
        template={mockTemplate}
        existingNote={emptyNote}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={mockOnUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
      />
    );

    const copyButton = screen.getByTitle('Copy Text Field content');
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByText('No content to copy from Text Field')).toBeInTheDocument();
    });

    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('handles clipboard write failure gracefully', async () => {
    (navigator.clipboard.writeText as vi.Mock).mockRejectedValue(new Error('Clipboard error'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <NoteEditor
        taskId="task1"
        template={mockTemplate}
        existingNote={mockExistingNote}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={mockOnUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
      />
    );

    const copyButton = screen.getByTitle('Copy Text Field content');
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to copy Text Field content')).toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });

  it('copies number field content as string', async () => {
    render(
      <NoteEditor
        taskId="task1"
        template={mockTemplate}
        existingNote={mockExistingNote}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={mockOnUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
      />
    );

    const copyButton = screen.getByTitle('Copy Number Field content');
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('42');
      expect(screen.getByText('Copied Number Field content to clipboard')).toBeInTheDocument();
    });
  });

  it('closes snackbar after timeout', async () => {
    render(
      <NoteEditor
        taskId="task1"
        template={mockTemplate}
        existingNote={mockExistingNote}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={mockOnUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
      />
    );

    const copyButton = screen.getByTitle('Copy Text Field content');
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByText('Copied Text Field content to clipboard')).toBeInTheDocument();
    });

    // Wait for snackbar to auto-hide (3 seconds)
    await waitFor(
      () => {
        expect(screen.queryByText('Copied Text Field content to clipboard')).not.toBeInTheDocument();
      },
      { timeout: 4000 }
    );
  });
});
