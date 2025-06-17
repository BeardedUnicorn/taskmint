/**
 * NoteEditor Unit Tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NoteEditor } from '../NoteEditor';
import { NoteTemplate } from '../../../../types/notes';

jest.mock('@tauri-apps/api/core', () => ({
  invoke: jest.fn().mockResolvedValue('Command output'),
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

  const mockOnSaveNote = jest.fn().mockResolvedValue({ id: 'note1' });
  const mockOnUpdateNote = jest.fn().mockResolvedValue({});
  const mockOnDeleteNote = jest.fn().mockResolvedValue({});

  it('renders fields correctly', () => {
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

    expect(screen.getByLabelText('Text Field')).toBeInTheDocument();
    expect(screen.getByLabelText('Command Field')).toBeInTheDocument();
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
