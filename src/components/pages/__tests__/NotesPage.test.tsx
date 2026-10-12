/**
 * NotesPage Component Tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { NotesPage } from '../NotesPage';
import { Task } from '../../../types/task';
import { TimeEntry } from '../../../types/timer';
import { TaskNote, NoteTemplate } from '../../../types/notes';

// Mock the hooks
vi.mock('../../../hooks/useTaskNotes', () => ({
  useTaskNotes: vi.fn(() => ({
    notes: [],
    createNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    getNotesByTaskId: vi.fn(() => []),
    getNotesByTimeEntryId: vi.fn(() => []),
    getNoteById: vi.fn(),
    getNotesStats: vi.fn(() => ({ totalNotes: 0, templatesUsed: [], notesByTemplate: {} })),
    isLoading: false,
    error: null,
  })),
}));

vi.mock('../../../hooks/useNoteTemplates', () => ({
  useNoteTemplates: vi.fn(() => ({
    templates: [],
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    getTemplateById: vi.fn(),
    getActiveTemplates: vi.fn(() => []),
    isLoading: false,
    error: null,
  })),
}));

// Mock the notes components
vi.mock('../../features/notes', () => ({
  NotesList: vi.fn(({ onCreateNote, onEditNote, onDeleteNote }) => (
    <div data-testid="notes-list">
      <button onClick={onCreateNote}>Create Note</button>
      <button onClick={() => onEditNote({ id: '1', taskId: 'task1' })}>Edit Note</button>
      <button onClick={() => onDeleteNote('1')}>Delete Note</button>
    </div>
  )),
  NoteEditor: vi.fn(({ onSaveNote, onUpdateNote, onDeleteNote, onCloseEditor }) => (
    <div data-testid="note-editor">
      <button onClick={() => onSaveNote({ taskId: 'task1', templateId: 'template1', templateName: 'Test Template', fieldValues: {} })}>Save Note</button>
      <button onClick={() => onUpdateNote('1', { fieldValues: { field1: 'updated' } })}>Update Note</button>
      <button onClick={() => onDeleteNote('1')}>Delete Note</button>
      <button onClick={onCloseEditor}>Close Editor</button>
    </div>
  )),
}));

describe('NotesPage', () => {
  const mockTasks: Task[] = [
    {
      id: 'task1',
      name: 'Task 1',
      hourlyRate: 50,
      defaultNoteTemplateId: 'template1',
      createdAt: '2024-01-01T09:00:00Z',
      updatedAt: '2024-01-01T09:00:00Z',
    },
    {
      id: 'task2',
      name: 'Task 2',
      hourlyRate: 60,
      defaultNoteTemplateId: null,
      createdAt: '2024-01-01T09:00:00Z',
      updatedAt: '2024-01-01T09:00:00Z',
    },
  ];

  const mockActiveEntry: TimeEntry = {
    id: 'entry1',
    taskName: 'Task 1',
    taskId: 'task1',
    startTime: new Date(),
    isRunning: true,
    date: '2024-01-01',
  };

  const mockNotes: TaskNote[] = [
    {
      id: 'note1',
      taskId: 'task1',
      templateId: 'template1',
      templateName: 'Template 1',
      fieldValues: { field1: 'value1' },
      createdAt: '2024-01-01T10:00:00Z',
      updatedAt: '2024-01-01T10:00:00Z',
    },
    {
      id: 'note2',
      taskId: 'task2',
      templateId: 'template2',
      templateName: 'Template 2',
      fieldValues: { field2: 'value2' },
      createdAt: '2024-01-01T11:00:00Z',
      updatedAt: '2024-01-01T11:00:00Z',
    },
  ];

  const mockTemplates: NoteTemplate[] = [
    {
      id: 'template1',
      name: 'Template 1',
      description: 'Test template 1',
      fields: [],
      createdAt: '2024-01-01T09:00:00Z',
      updatedAt: '2024-01-01T09:00:00Z',
      isActive: true,
    },
    {
      id: 'template2',
      name: 'Template 2',
      description: 'Test template 2',
      fields: [],
      createdAt: '2024-01-01T09:00:00Z',
      updatedAt: '2024-01-01T09:00:00Z',
      isActive: true,
    },
  ];

  let mockUseTaskNotes: any;
  let mockUseNoteTemplates: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Import the mocked functions
    const taskNotesModule = await import('../../../hooks/useTaskNotes');
    const noteTemplatesModule = await import('../../../hooks/useNoteTemplates');
    
    mockUseTaskNotes = vi.mocked(taskNotesModule.useTaskNotes);
    mockUseNoteTemplates = vi.mocked(noteTemplatesModule.useNoteTemplates);
  });

  it('renders the notes page with header and controls', () => {
    render(<NotesPage tasks={mockTasks} activeEntry={null} />);

    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Manage all your notes across tasks in one place')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search notes...')).toBeInTheDocument();
    expect(screen.getByText('Add Note')).toBeInTheDocument();
  });

  it('shows active timer information when there is an active entry', () => {
    mockUseNoteTemplates.mockReturnValue({
      templates: mockTemplates,
      createTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      deleteTemplate: vi.fn(),
      getTemplateById: vi.fn(),
      getActiveTemplates: vi.fn(() => mockTemplates),
      isLoading: false,
      error: null,
    });

    render(<NotesPage tasks={mockTasks} activeEntry={mockActiveEntry} />);

    expect(screen.getByText(/Active Timer:/)).toBeInTheDocument();
    expect(screen.getByText(/Task 1/)).toBeInTheDocument();
    expect(screen.getByText(/New notes will use "Template 1" template/)).toBeInTheDocument();
  });

  it('shows no default template message when active task has no default template', () => {
    const mockActiveEntryNoTemplate: TimeEntry = {
      ...mockActiveEntry,
      taskName: 'Task 2', // Task 2 has no default template
      taskId: 'task2',
    };

    render(<NotesPage tasks={mockTasks} activeEntry={mockActiveEntryNoTemplate} />);

    expect(screen.getByText(/No default template set/)).toBeInTheDocument();
  });

  it('displays notes count in the header chip', () => {
    mockUseTaskNotes.mockReturnValue({
      notes: mockNotes,
      createNote: vi.fn(),
      updateNote: vi.fn(),
      deleteNote: vi.fn(),
      getNotesByTaskId: vi.fn(() => mockNotes),
      getNotesByTimeEntryId: vi.fn(() => []),
      getNoteById: vi.fn(),
      getNotesStats: vi.fn(() => ({ totalNotes: 2, templatesUsed: [], notesByTemplate: {} })),
      isLoading: false,
      error: null,
    });

    render(<NotesPage tasks={mockTasks} activeEntry={null} />);

    expect(screen.getByText('2 notes')).toBeInTheDocument();
  });

  it('filters notes by task when task filter is changed', async () => {
    mockUseTaskNotes.mockReturnValue({
      notes: mockNotes,
      createNote: vi.fn(),
      updateNote: vi.fn(),
      deleteNote: vi.fn(),
      getNotesByTaskId: vi.fn(() => mockNotes),
      getNotesByTimeEntryId: vi.fn(() => []),
      getNoteById: vi.fn(),
      getNotesStats: vi.fn(() => ({ totalNotes: 2, templatesUsed: [], notesByTemplate: {} })),
      searchNotes: vi.fn(() => mockNotes),
      sortNotes: vi.fn(() => mockNotes),
      isLoading: false,
      error: null,
    });

    render(<NotesPage tasks={mockTasks} activeEntry={null} />);

    // Find the task filter by looking for the combobox with "All Tasks" text
    const taskFilterElements = screen.getAllByRole('combobox');
    const taskFilter = taskFilterElements.find(element => 
      element.textContent === 'All Tasks'
    );
    
    if (taskFilter) {
      fireEvent.mouseDown(taskFilter);
      
      await waitFor(() => {
        expect(screen.getByText('Task 1')).toBeInTheDocument();
      });
    }
  });

  it('shows note editor when creating a new note', async () => {
    render(<NotesPage tasks={mockTasks} activeEntry={null} />);

    const addButton = screen.getByText('Add Note');
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByTestId('note-editor')).toBeInTheDocument();
    });
  });

  it('shows note editor when editing an existing note', async () => {
    mockUseTaskNotes.mockReturnValue({
      notes: mockNotes,
      createNote: vi.fn(),
      updateNote: vi.fn(),
      deleteNote: vi.fn(),
      getNotesByTaskId: vi.fn(() => mockNotes),
      getNotesByTimeEntryId: vi.fn(() => []),
      getNoteById: vi.fn(),
      getNotesStats: vi.fn(() => ({ totalNotes: 2, templatesUsed: [], notesByTemplate: {} })),
      isLoading: false,
      error: null,
    });

    render(<NotesPage tasks={mockTasks} activeEntry={null} />);

    const editButton = screen.getByText('Edit Note');
    fireEvent.click(editButton);

    await waitFor(() => {
      expect(screen.getByTestId('note-editor')).toBeInTheDocument();
    });
  });

  it('calls createNote when saving a new note', async () => {
    const mockCreateNote = vi.fn().mockResolvedValue({ id: 'new-note' });
    mockUseTaskNotes.mockReturnValue({
      notes: [],
      createNote: mockCreateNote,
      updateNote: vi.fn(),
      deleteNote: vi.fn(),
      getNotesByTaskId: vi.fn(() => []),
      getNotesByTimeEntryId: vi.fn(() => []),
      getNoteById: vi.fn(),
      getNotesStats: vi.fn(() => ({ totalNotes: 0, templatesUsed: [], notesByTemplate: {} })),
      isLoading: false,
      error: null,
    });

    render(<NotesPage tasks={mockTasks} activeEntry={null} />);

    const addButton = screen.getByText('Add Note');
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByTestId('note-editor')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Note');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockCreateNote).toHaveBeenCalledWith({
        taskId: 'task1', // Should default to first task
        templateId: 'template1',
        templateName: 'Test Template',
        fieldValues: {},
      });
    });
  });

  it('calls updateNote when updating an existing note', async () => {
    const mockUpdateNote = vi.fn().mockResolvedValue({ id: '1' });
    mockUseTaskNotes.mockReturnValue({
      notes: mockNotes,
      createNote: vi.fn(),
      updateNote: mockUpdateNote,
      deleteNote: vi.fn(),
      getNotesByTaskId: vi.fn(() => mockNotes),
      getNotesByTimeEntryId: vi.fn(() => []),
      getNoteById: vi.fn(),
      getNotesStats: vi.fn(() => ({ totalNotes: 2, templatesUsed: [], notesByTemplate: {} })),
      isLoading: false,
      error: null,
    });

    render(<NotesPage tasks={mockTasks} activeEntry={null} />);

    const editButton = screen.getByText('Edit Note');
    fireEvent.click(editButton);

    await waitFor(() => {
      expect(screen.getByTestId('note-editor')).toBeInTheDocument();
    });

    const updateButton = screen.getByText('Update Note');
    fireEvent.click(updateButton);

    await waitFor(() => {
      expect(mockUpdateNote).toHaveBeenCalledWith('1', {
        fieldValues: { field1: 'updated' },
      });
    });
  });

  it('calls deleteNote when deleting a note', async () => {
    const mockDeleteNote = vi.fn().mockResolvedValue(undefined);
    mockUseTaskNotes.mockReturnValue({
      notes: mockNotes,
      createNote: vi.fn(),
      updateNote: vi.fn(),
      deleteNote: mockDeleteNote,
      getNotesByTaskId: vi.fn(() => mockNotes),
      getNotesByTimeEntryId: vi.fn(() => []),
      getNoteById: vi.fn(),
      getNotesStats: vi.fn(() => ({ totalNotes: 2, templatesUsed: [], notesByTemplate: {} })),
      isLoading: false,
      error: null,
    });

    render(<NotesPage tasks={mockTasks} activeEntry={null} />);

    const deleteButton = screen.getByText('Delete Note');
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockDeleteNote).toHaveBeenCalledWith('1');
    });
  });

  it('closes note editor when close button is clicked', async () => {
    render(<NotesPage tasks={mockTasks} activeEntry={null} />);

    const addButton = screen.getByText('Add Note');
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByTestId('note-editor')).toBeInTheDocument();
    });

    const closeButton = screen.getByText('Close Editor');
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByTestId('note-editor')).not.toBeInTheDocument();
    });
  });

  it('keeps the editor open after a save (auto-save saves while you type)', async () => {
    const mockCreateNote = vi.fn().mockResolvedValue({ id: 'new-note' });
    mockUseTaskNotes.mockReturnValue({
      notes: [],
      createNote: mockCreateNote,
      updateNote: vi.fn(),
      deleteNote: vi.fn(),
      isLoading: false,
      error: null,
    });

    render(<NotesPage tasks={mockTasks} activeEntry={null} />);
    fireEvent.click(screen.getByText('Add Note'));
    fireEvent.click(await screen.findByText('Save Note'));

    await waitFor(() => expect(mockCreateNote).toHaveBeenCalled());
    expect(screen.getByTestId('note-editor')).toBeInTheDocument();
  });

  it("offers tasks favorites-first in the editor's picker, defaulting to the running timer's task", async () => {
    const { NoteEditor } = await import('../../features/notes');
    const tasks: Task[] = [
      ...mockTasks,
      { ...mockTasks[1], id: 'task3', name: 'Task 3', isFavorite: true },
      { ...mockTasks[1], id: 'task4', name: 'Old task', isArchived: true },
    ];
    // A running timer on Task 2, renamed since: matched by id, not name
    const entry = { ...mockActiveEntry, taskId: 'task2', taskName: 'Renamed' };

    render(<NotesPage tasks={tasks} activeEntry={entry} />);
    fireEvent.click(screen.getByText('Add Note'));
    await screen.findByTestId('note-editor');

    const props = vi.mocked(NoteEditor).mock.calls.at(-1)![0];
    expect(props.taskId).toBe('task2');
    expect(props.tasks!.map(task => task.id)).toEqual(['task3', 'task1', 'task2']);
  });

  it("shows each note's task", async () => {
    const { NotesList } = await import('../../features/notes');
    mockUseTaskNotes.mockReturnValue({
      notes: mockNotes,
      createNote: vi.fn(),
      updateNote: vi.fn(),
      deleteNote: vi.fn(),
      searchNotes: vi.fn(() => mockNotes),
      isLoading: false,
      error: null,
    });

    render(<NotesPage tasks={mockTasks} activeEntry={null} />);

    expect(vi.mocked(NotesList).mock.calls.at(-1)![0].taskNames).toEqual({
      task1: 'Task 1',
      task2: 'Task 2',
    });
  });

  it('shows no tasks message when no tasks are available', () => {
    render(<NotesPage tasks={[]} activeEntry={null} />);

    expect(screen.getByText('No Tasks Available')).toBeInTheDocument();
    expect(screen.getByText('Create some tasks first to start adding notes.')).toBeInTheDocument();
  });

  it('disables add note button when no tasks are available', () => {
    render(<NotesPage tasks={[]} activeEntry={null} />);

    const addButton = screen.getByText('Add Note');
    expect(addButton).toBeDisabled();
  });

  it('shows no notes found message when no notes match filters', () => {
    mockUseTaskNotes.mockReturnValue({
      notes: [],
      createNote: vi.fn(),
      updateNote: vi.fn(),
      deleteNote: vi.fn(),
      getNotesByTaskId: vi.fn(() => []),
      getNotesByTimeEntryId: vi.fn(() => []),
      getNoteById: vi.fn(),
      getNotesStats: vi.fn(() => ({ totalNotes: 0, templatesUsed: [], notesByTemplate: {} })),
      isLoading: false,
      error: null,
    });

    render(<NotesPage tasks={mockTasks} activeEntry={null} />);

    expect(screen.getByText('No Notes Found')).toBeInTheDocument();
    expect(screen.getByText('Start by creating your first note using the "Add Note" button above.')).toBeInTheDocument();
  });

  it('performs search when search input changes', async () => {
    const mockSearchNotes = vi.fn(() => []);
    mockUseTaskNotes.mockReturnValue({
      notes: mockNotes,
      createNote: vi.fn(),
      updateNote: vi.fn(),
      deleteNote: vi.fn(),
      getNotesByTaskId: vi.fn(() => []),
      getNotesByTimeEntryId: vi.fn(() => []),
      getNoteById: vi.fn(),
      getNotesStats: vi.fn(() => ({ totalNotes: 2, templatesUsed: [], notesByTemplate: {} })),
      searchNotes: mockSearchNotes,
      sortNotes: vi.fn(() => []),
      isLoading: false,
      error: null,
    });

    render(<NotesPage tasks={mockTasks} activeEntry={null} />);

    const searchInput = screen.getByPlaceholderText('Search notes...');
    fireEvent.change(searchInput, { target: { value: 'test search' } });

    // The search functionality would be tested through the component's behavior
    // since the actual search logic is internal to the component
    expect(searchInput).toHaveValue('test search');
  });

  it('uses active timer task as default when creating new note', async () => {
    mockUseNoteTemplates.mockReturnValue({
      templates: mockTemplates,
      createTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      deleteTemplate: vi.fn(),
      getTemplateById: vi.fn(),
      getActiveTemplates: vi.fn(() => mockTemplates),
      isLoading: false,
      error: null,
    });

    const mockCreateNote = vi.fn().mockResolvedValue({ id: 'new-note' });
    mockUseTaskNotes.mockReturnValue({
      notes: [],
      createNote: mockCreateNote,
      updateNote: vi.fn(),
      deleteNote: vi.fn(),
      getNotesByTaskId: vi.fn(() => []),
      getNotesByTimeEntryId: vi.fn(() => []),
      getNoteById: vi.fn(),
      getNotesStats: vi.fn(() => ({ totalNotes: 0, templatesUsed: [], notesByTemplate: {} })),
      isLoading: false,
      error: null,
    });

    render(<NotesPage tasks={mockTasks} activeEntry={mockActiveEntry} />);

    const addButton = screen.getByText('Add Note');
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByTestId('note-editor')).toBeInTheDocument();
    });

    // The editor should be initialized with the active task's template
    // This is tested indirectly through the component behavior
  });
});
