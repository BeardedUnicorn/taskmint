/**
 * NoteEditor Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render as rtlRender, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { ReactElement } from 'react';
import { NoteTemplatesProvider } from '../../../../contexts/NoteTemplatesContext';
import { NotificationProvider } from '../../../../contexts/NotificationContext';

// NoteEditor reads the shared templates and reports through toasts
const render = (ui: ReactElement) =>
  rtlRender(ui, {
    wrapper: ({ children }) => (
      <NotificationProvider>
        <NoteTemplatesProvider>{children}</NoteTemplatesProvider>
      </NotificationProvider>
    ),
  });
import { NoteEditor } from '../NoteEditor';
import { NoteTemplate, TaskNote } from '../../../../types/notes';
import { fakeBackend } from '../../../../testing';

const existingTemplateNote: TaskNote = {
  id: 'note1',
  taskId: 'task1',
  templateId: 'template1',
  templateName: 'Test Template',
  fieldValues: { field1: 'Important text', field2: 3 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

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
        autoSaveDisabled
        noteLevel="task"
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Text Field')).toBeInTheDocument();
      expect(screen.getByLabelText('Number Field')).toBeInTheDocument();
    });
  });

  it('never runs a backend command when a template opens', async () => {
    render(
      <NoteEditor
        taskId="task1"
        template={mockTemplate}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={mockOnUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        autoSaveDisabled
        noteLevel="task"
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Text Field')).toBeInTheDocument();
    });
    expect(screen.queryByTitle('Run Command')).not.toBeInTheDocument();
    // Saving records is all it may ask of the backend
    const commands = fakeBackend().call.mock.calls.map(([command]) => command);
    expect(commands.filter(command => command !== 'set_app_record')).toEqual([]);
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
        autoSaveDisabled
        noteLevel="task"
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
        autoSaveDisabled
        noteLevel="task"
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

  it('parses number inputs as numbers before saving', async () => {
    const numberTemplate: NoteTemplate = {
      id: 'tmpl-number',
      name: 'Number Template',
      fields: [
        {
          id: 'num',
          label: 'Number Field',
          type: 'number',
          required: false,
          order: 0,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
    };

    mockOnSaveNote.mockClear();

    render(
      <NoteEditor
        taskId="task1"
        template={numberTemplate}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={mockOnUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        autoSaveDisabled
        noteLevel="task"
      />
    );

    const numInput = await screen.findByLabelText('Number Field');
    fireEvent.change(numInput, { target: { value: '123' } });
    fireEvent.click(screen.getByText('Save Note'));

    await waitFor(() => {
      expect(mockOnSaveNote).toHaveBeenCalledWith(
        expect.objectContaining({ fieldValues: { num: 123 } })
      );
    });
  });

  it('creates notes with their session and timer context, and updates keep them', async () => {
    mockOnSaveNote.mockClear();
    mockOnUpdateNote.mockClear();

    const existingNote: TaskNote = {
      id: 'note1',
      taskId: 'task1',
      templateId: 'template1',
      templateName: 'Test Template',
      fieldValues: { field1: 'value1' },
      sessionId: 'session1',
      timerInstanceId: 'timer1',
      noteLevel: 'session',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { unmount } = render(
      <NoteEditor
        taskId="task1"
        template={mockTemplate}
        existingNote={existingNote}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={mockOnUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        autoSaveDisabled
        sessionId="session1"
        timerInstanceId="timer1"
        noteLevel="session"
      />
    );

    // Save existing note (triggers update)
    fireEvent.click(await screen.findByText('Update Note'));

    // Content and task only: the note's own session/timer link stays as is,
    // wherever it's edited from (the Notes page edits at "task" level).
    await waitFor(() => {
      expect(mockOnUpdateNote).toHaveBeenCalledWith('note1', {
        fieldValues: { field1: 'value1', field2: null },
        taskId: 'task1',
      });
    });

    // Test create path with same context
    unmount();

    render(
      <NoteEditor
        taskId="task1"
        template={mockTemplate}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={mockOnUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        autoSaveDisabled
        sessionId="session1"
        timerInstanceId="timer1"
        noteLevel="session"
      />
    );

    // (An empty new note isn't saved at all)
    fireEvent.change(screen.getByLabelText('Text Field'), { target: { value: 'context' } });
    fireEvent.click(screen.getByText('Save Note'));

    await waitFor(() => {
      expect(mockOnSaveNote).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session1',
          timerInstanceId: 'timer1',
          noteLevel: 'session',
        })
      );
    });
  });

  describe('task picker', () => {
    const tasks = [
      { id: 'task1', name: 'Annotation', createdAt: '', updatedAt: '' },
      { id: 'task2', name: 'Review', createdAt: '', updatedAt: '' },
    ];

    const chooseTask = async (name: string) => {
      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Task' }));
      fireEvent.click(await screen.findByRole('option', { name }));
    };

    it('saves a new note to the chosen task', async () => {
      mockOnSaveNote.mockClear();
      render(
        <NoteEditor
          taskId="task1"
          tasks={tasks}
          template={null}
          onSaveNote={mockOnSaveNote}
          onUpdateNote={mockOnUpdateNote}
          onDeleteNote={mockOnDeleteNote}
          isCollapsed={false}
          onToggleCollapse={() => {}}
          autoSaveDisabled
          noteLevel="task"
        />
      );

      expect(screen.getByRole('combobox', { name: 'Task' })).toHaveTextContent('Annotation');
      await chooseTask('Review');
      fireEvent.change(screen.getByLabelText('Note Content'), { target: { value: 'hello' } });
      fireEvent.click(screen.getByText('Save Note'));

      await waitFor(() => {
        expect(mockOnSaveNote).toHaveBeenCalledWith(
          expect.objectContaining({ taskId: 'task2', fieldValues: { content: 'hello' } })
        );
      });
    });

    it("doesn't keep trying to auto-save a new note that has only a task", async () => {
      const onSaveNote = vi.fn();
      render(
        <NoteEditor
          taskId="task1"
          tasks={tasks}
          template={null}
          onSaveNote={onSaveNote}
          onUpdateNote={mockOnUpdateNote}
          onDeleteNote={mockOnDeleteNote}
          isCollapsed={false}
          onToggleCollapse={() => {}}
          onCloseEditor={() => {}}
          noteLevel="task"
        />
      );

      await chooseTask('Review');
      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(onSaveNote).not.toHaveBeenCalled();
      // Not stuck in "saving": Save stays usable
      expect(screen.getByRole('button', { name: 'Save Note' })).toBeEnabled();
    });

    it('moves an existing note to another task', async () => {
      mockOnUpdateNote.mockClear();
      const note: TaskNote = {
        id: 'note1',
        taskId: 'task1',
        templateId: 'free-form',
        templateName: 'Free-form Note',
        fieldValues: { content: 'text' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      render(
        <NoteEditor
          taskId="task1"
          tasks={tasks}
          template={null}
          existingNote={note}
          onSaveNote={mockOnSaveNote}
          onUpdateNote={mockOnUpdateNote}
          onDeleteNote={mockOnDeleteNote}
          isCollapsed={false}
          onToggleCollapse={() => {}}
          autoSaveDisabled
          noteLevel="task"
        />
      );

      await chooseTask('Review');
      fireEvent.click(screen.getByText('Update Note'));

      await waitFor(() => {
        expect(mockOnUpdateNote).toHaveBeenCalledWith('note1', {
          fieldValues: { content: 'text' },
          taskId: 'task2',
        });
      });
    });
  });

  it('never creates an empty template note either; Save just closes', async () => {
    const onCloseEditor = vi.fn();
    render(
      <NoteEditor
        taskId="task1"
        template={mockTemplate}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={mockOnUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        onCloseEditor={onCloseEditor}
      />
    );
    mockOnSaveNote.mockClear();

    fireEvent.click(screen.getByText('Save Note'));

    await waitFor(() => expect(onCloseEditor).toHaveBeenCalled());
    expect(mockOnSaveNote).not.toHaveBeenCalled();
  });

  it('saves pending changes to a saved note when it closes', async () => {
    const onCloseEditor = vi.fn();
    const onUpdateNote = vi.fn().mockImplementation(async (id: string, updates: Partial<TaskNote>) => ({
      ...existingTemplateNote,
      ...updates,
      id,
    }));
    render(
      <NoteEditor
        taskId="task1"
        template={mockTemplate}
        existingNote={existingTemplateNote}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={onUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        onCloseEditor={onCloseEditor}
      />
    );

    fireEvent.change(screen.getByLabelText('Text Field'), { target: { value: 'edited' } });
    fireEvent.click(screen.getByText('Close'));

    await waitFor(() => expect(onCloseEditor).toHaveBeenCalled());
    expect(onUpdateNote).toHaveBeenCalledWith('note1', {
      fieldValues: { field1: 'edited', field2: 3 },
      taskId: 'task1',
    });
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
  });

  it("keeps typing that happens while a save is in flight", async () => {
    let finish!: (note: TaskNote) => void;
    const onUpdateNote = vi.fn(() => new Promise<TaskNote>(resolve => (finish = resolve)));
    render(
      <NoteEditor
        taskId="task1"
        template={mockTemplate}
        existingNote={existingTemplateNote}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={onUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
      />
    );
    const field = screen.getByLabelText('Text Field');

    fireEvent.change(field, { target: { value: 'first' } });
    fireEvent.click(screen.getByText('Update Note'));
    await waitFor(() => expect(onUpdateNote).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status')).toHaveTextContent('Saving…');

    fireEvent.change(field, { target: { value: 'first and more' } });
    await act(async () => {
      finish({ ...existingTemplateNote, fieldValues: { field1: 'first', field2: null } });
    });

    expect(field).toHaveValue('first and more');
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
  });

  it('offers Retry after a failed save', async () => {
    const onUpdateNote = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValue(existingTemplateNote);
    render(
      <NoteEditor
        taskId="task1"
        template={mockTemplate}
        existingNote={existingTemplateNote}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={onUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        autoSaveDisabled
      />
    );

    fireEvent.change(screen.getByLabelText('Text Field'), { target: { value: 'edited' } });
    fireEvent.click(screen.getByText('Update Note'));
    expect(await screen.findByText("Couldn't save")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^Saved · /));
    expect(onUpdateNote).toHaveBeenCalledTimes(2);
  });

  it("edits a free-form note's text when given the built-in free-form template", async () => {
    const builtIn: NoteTemplate = {
      id: 'free-form',
      name: 'Free-form Note',
      fields: [],
      isActive: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    const freeFormNote: TaskNote = {
      ...existingTemplateNote,
      templateId: 'free-form',
      templateName: 'Free-form Note',
      fieldValues: { content: 'Reviewed batch 4' },
    };
    render(
      <NoteEditor
        taskId="task1"
        template={builtIn}
        existingNote={freeFormNote}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={mockOnUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        autoSaveDisabled
        noteLevel="task"
      />
    );

    expect(screen.getByLabelText('Note Content')).toHaveValue('Reviewed batch 4');
  });

  it('never saves an empty free-form note; Save just closes', async () => {
    mockOnSaveNote.mockClear();
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
        autoSaveDisabled
        noteLevel="task"
      />
    );

    fireEvent.change(screen.getByLabelText('Note Content'), { target: { value: '   ' } });
    fireEvent.click(screen.getByText('Save Note'));

    await waitFor(() => expect(onCloseEditor).toHaveBeenCalled());
    expect(mockOnSaveNote).not.toHaveBeenCalled();
  });

  it('keeps the field you are typing in after auto-save creates the note', async () => {
    const saved: TaskNote = {
      id: 'note-new',
      taskId: 'task1',
      templateId: 'free-form',
      templateName: 'Free-form Note',
      fieldValues: { content: 'first thoughts' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const onSaveNote = vi.fn().mockResolvedValue(saved);
    render(
      <NoteEditor
        taskId="task1"
        template={null}
        onSaveNote={onSaveNote}
        onUpdateNote={mockOnUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        onCloseEditor={() => {}}
        noteLevel="task"
      />
    );

    const field = screen.getByLabelText('Note Content');
    fireEvent.change(field, { target: { value: 'first thoughts' } });

    await waitFor(() => expect(onSaveNote).toHaveBeenCalledTimes(1), { timeout: 2500 });
    // Same text field, still holding the text; the template choice is gone
    // (the note exists now) and Cancel became Close.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument());
    expect(screen.getByLabelText('Note Content')).toBe(field);
    expect(field).toHaveValue('first thoughts');
    expect(screen.queryByLabelText('Select Template')).not.toBeInTheDocument();
  });

  it("doesn't auto-save a cleared note over its saved content", async () => {
    const onUpdateNote = vi.fn().mockResolvedValue({});
    const existingNote: TaskNote = {
      id: 'note1',
      taskId: 'task1',
      templateId: 'template1',
      templateName: 'Test Template',
      fieldValues: { field1: 'Important text', field2: 3 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    render(
      <NoteEditor
        taskId="task1"
        template={mockTemplate}
        existingNote={existingNote}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={onUpdateNote}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        noteLevel="task"
      />
    );
    await waitFor(() => expect(screen.getByLabelText('Text Field')).toHaveValue('Important text'));

    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(screen.getByLabelText('Text Field')).toHaveValue('');

    // Well past the 1s auto-save delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    expect(onUpdateNote).not.toHaveBeenCalled();
  });

  it('puts the cleared text back with Undo', async () => {
    const existingNote: TaskNote = {
      id: 'note1',
      taskId: 'task1',
      templateId: 'template1',
      templateName: 'Test Template',
      fieldValues: { field1: 'Important text', field2: 3 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    render(
      <NoteEditor
        taskId="task1"
        template={mockTemplate}
        existingNote={existingNote}
        onSaveNote={mockOnSaveNote}
        onUpdateNote={vi.fn().mockResolvedValue({})}
        onDeleteNote={mockOnDeleteNote}
        isCollapsed={false}
        onToggleCollapse={() => {}}
        noteLevel="task"
      />
    );
    await waitFor(() => expect(screen.getByLabelText('Text Field')).toHaveValue('Important text'));

    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(screen.getByLabelText('Text Field')).toHaveValue('');
    expect(screen.getByText('Cleared the note')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.getByLabelText('Text Field')).toHaveValue('Important text'));
  });
});
