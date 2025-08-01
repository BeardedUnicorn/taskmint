/**
 * NoteEditor Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NoteEditor } from '../NoteEditor';
import { NoteTemplate } from '../../../../types/notes';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue('Command output'),
}));

describe('NoteEditor', () => {
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
        label: 'Command Field',
        type: 'command',
        required: false,
        order: 1,
        command: 'echo "Test"',
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isActive: true,
  };

  const mockOnSaveNote = vi.fn().mockResolvedValue({ id: 'note1' });
  const mockOnUpdateNote = vi.fn().mockResolvedValue({});
  const mockOnDeleteNote = vi.fn().mockResolvedValue({});

  it('renders fields correctly', async () => {
    render(
      <NoteEditor
        taskId="task1"
        template={mockTemplate}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={mockOnUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Text Field')).toBeInTheDocument();
      expect(screen.getByLabelText('Command Field')).toBeInTheDocument();
    });
  });

  it('runs command on button click', async () => {
    render(
      <NoteEditor
        taskId="task1"
        template={mockTemplate}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={mockOnUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
      />
    );

    const runButton = screen.getByTitle('Run Command');
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(screen.getByLabelText('Command Field')).toHaveValue('Command output');
    });
  });

  it('shows confirmation dialog when cancelling with unsaved changes', async () => {
    const onCloseEditor = vi.fn();

    render(
      <NoteEditor
        taskId="task1"
        template={null}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={mockOnUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        onCloseEditor={onCloseEditor}
      />
    );

    fireEvent.change(screen.getByLabelText('Note Content'), { target: { value: 'changed' } });
    fireEvent.click(screen.getByText('Cancel'));

    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
    expect(onCloseEditor).not.toHaveBeenCalled();
  });

  it('calls onCloseEditor only after confirming discard', async () => {
    const onCloseEditor = vi.fn();

    render(
      <NoteEditor
        taskId="task1"
        template={null}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={mockOnUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        onCloseEditor={onCloseEditor}
      />
    );

    fireEvent.change(screen.getByLabelText('Note Content'), { target: { value: 'changed' } });
    fireEvent.click(screen.getByText('Cancel'));
    const discardButton = await screen.findByText('Discard');
    fireEvent.click(discardButton);

    await waitFor(() => {
      expect(onCloseEditor).toHaveBeenCalledTimes(1);
    });
  });
});
