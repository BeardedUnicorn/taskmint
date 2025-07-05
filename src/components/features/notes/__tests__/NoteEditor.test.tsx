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
});
