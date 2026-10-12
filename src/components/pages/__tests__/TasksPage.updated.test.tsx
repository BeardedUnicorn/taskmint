/**
 * TasksPage Component Tests - Task List Layout with Archiving
 *
 * Renders the real TaskListPane (master list) with mocked detail pane and
 * dialogs. Covers row selection, add/edit/delete flows, archiving, and the
 * selection fallback preferring active tasks.
 */

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { TasksPage } from '../TasksPage';
import { Task } from '../../../types/task';
import { TimeEntry } from '../../../types/timer';

// Mock the task detail pane
vi.mock('../tasks/TaskDetailPane', () => ({
  TaskDetailPane: vi.fn(({ task, onEditEntry, onDeleteEntry }) => (
    <div data-testid="task-detail-pane">
      <h3>{task.name} Details</h3>
      {task.isArchived && <span data-testid="detail-archived-flag">Archived Detail</span>}
      <button onClick={() => onEditEntry({ id: 'entry1', taskName: task.name })}>Edit Entry</button>
      <button onClick={() => onDeleteEntry('entry1')}>Delete Entry</button>
    </div>
  )),
}));

// Mock the task form dialog used for both add and edit modes
vi.mock('../tasks/TaskFormDialog', () => ({
  TaskFormDialog: vi.fn(({ open, mode, onSubmit, onClose }) =>
    open ? (
      <div data-testid={mode === 'add' ? 'add-task-dialog' : 'edit-task-dialog'}>
        <button
          onClick={() =>
            onSubmit(
              mode === 'add'
                ? { name: 'New Task', hourlyRate: 50 }
                : { name: 'Updated Task', hourlyRate: 60 }
            )
          }
        >
          {mode === 'add' ? 'Save Task' : 'Save Changes'}
        </button>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null
  ),
}));

vi.mock('../../ui/dialogs/EditTimeEntryDialog', () => ({
  EditTimeEntryDialog: vi.fn(({ open, onSave, onClose }) =>
    open ? (
      <div data-testid="edit-time-entry-dialog">
        <button onClick={() => onSave({ id: 'entry1', taskName: 'Updated Task', durationMs: 3600000 })}>Save Entry</button>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null
  ),
}));

vi.mock('../../ui', () => ({
  ConfirmDialog: vi.fn(({ open, onConfirm, onClose }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null
  ),
  // The real TaskListPane renders this header
  SearchListHeader: vi.fn(({ title, searchValue, onSearchChange, actions }) => (
    <div data-testid="search-list-header">
      <span>{title}</span>
      <input
        aria-label="Search tasks"
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      {actions}
    </div>
  )),
}));

describe('TasksPage - Task List Layout', () => {
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

  const archivedTask: Task = {
    id: 'task3',
    name: 'Old Task',
    hourlyRate: 40,
    isArchived: true,
    archivedAt: '2024-02-01T00:00:00Z',
    createdAt: '2024-01-01T09:00:00Z',
    updatedAt: '2024-02-01T00:00:00Z',
  };

  const mockTimeEntries: TimeEntry[] = [
    {
      id: 'entry1',
      taskName: 'Task 1',
      startTime: new Date('2024-01-01T10:00:00Z'),
      endTime: new Date('2024-01-01T11:00:00Z'),
      duration: 3600000,
      isRunning: false,
      date: '2024-01-01',
    },
  ];

  const mockProps = {
    tasks: mockTasks,
    timeEntries: mockTimeEntries,
    onAddTask: vi.fn(),
    onUpdateTask: vi.fn(),
    onDeleteTask: vi.fn(),
    onArchiveTask: vi.fn(),
    onUnarchiveTask: vi.fn(),
    onUpdateEntry: vi.fn(),
    onDeleteEntry: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the tasks page with header, task list, and controls', () => {
    render(<TasksPage {...mockProps} />);

    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('Manage your tasks and view detailed time tracking information')).toBeInTheDocument();
    expect(screen.getByText('Task List')).toBeInTheDocument();
    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText('Task 2')).toBeInTheDocument();
    expect(screen.getByText('Add Task')).toBeInTheDocument();
  });

  it('does not render notes section', () => {
    render(<TasksPage {...mockProps} />);

    expect(screen.queryByText('Task Notes')).not.toBeInTheDocument();
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-notes-integration')).not.toBeInTheDocument();
  });

  it('selects the first task by default and shows its details', () => {
    render(<TasksPage {...mockProps} />);

    expect(screen.getByTestId('task-detail-pane')).toBeInTheDocument();
    expect(screen.getByText('Task 1 Details')).toBeInTheDocument();
  });

  it('prefers the first active task for the initial selection', () => {
    render(<TasksPage {...mockProps} tasks={[archivedTask, ...mockTasks]} />);

    // task3 is archived and first in the list, but selection lands on Task 1
    expect(screen.getByText('Task 1 Details')).toBeInTheDocument();
  });

  it('allows selecting a task by clicking its row', async () => {
    render(<TasksPage {...mockProps} />);

    fireEvent.click(screen.getByText('Task 2'));

    await waitFor(() => {
      expect(screen.getByText('Task 2 Details')).toBeInTheDocument();
    });
  });

  it('lists archived tasks in a labeled section and keeps them selectable', async () => {
    render(<TasksPage {...mockProps} tasks={[...mockTasks, archivedTask]} />);

    expect(screen.getByText('Archived (1)')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Old Task'));

    await waitFor(() => {
      expect(screen.getByText('Old Task Details')).toBeInTheDocument();
      expect(screen.getByTestId('detail-archived-flag')).toBeInTheDocument();
    });
  });

  it('calls onArchiveTask with the task id when the row archive button is clicked', () => {
    render(<TasksPage {...mockProps} />);

    // Task 2 is not selected; archiving must not require selecting it first
    const archiveButtons = screen.getAllByLabelText('Archive task');
    expect(archiveButtons).toHaveLength(2);
    fireEvent.click(archiveButtons[1]);

    expect(mockProps.onArchiveTask).toHaveBeenCalledWith('task2');
    // Row action does not change the selection
    expect(screen.getByText('Task 1 Details')).toBeInTheDocument();
  });

  it('calls onUnarchiveTask for archived rows', () => {
    render(<TasksPage {...mockProps} tasks={[...mockTasks, archivedTask]} />);

    fireEvent.click(screen.getByLabelText('Unarchive task'));

    expect(mockProps.onUnarchiveTask).toHaveBeenCalledWith('task3');
  });

  it('keeps the archived task selected and refreshes its detail after archiving', async () => {
    const { rerender } = render(<TasksPage {...mockProps} />);
    expect(screen.getByText('Task 1 Details')).toBeInTheDocument();

    // Parent state updates after onArchiveTask resolves
    const updatedTasks = [
      { ...mockTasks[0], isArchived: true, archivedAt: '2024-02-01T00:00:00Z' },
      mockTasks[1],
    ];
    rerender(<TasksPage {...mockProps} tasks={updatedTasks} />);

    await waitFor(() => {
      expect(screen.getByText('Task 1 Details')).toBeInTheDocument();
      expect(screen.getByTestId('detail-archived-flag')).toBeInTheDocument();
    });
  });

  describe('deleting a task', () => {
    it('offers Archive when the task has tracked time, and says what delete really does', async () => {
      render(<TasksPage {...mockProps} />);

      fireEvent.click(screen.getAllByLabelText('Delete task')[0]);

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/1 time entry \(1h 0m\)/)).toBeInTheDocument();
      expect(within(dialog).getByText(/lose its hourly rate/)).toBeInTheDocument();
      expect(within(dialog).queryByText(/remove all associated time entries/)).not.toBeInTheDocument();

      fireEvent.click(within(dialog).getByRole('button', { name: 'Archive instead' }));

      expect(mockProps.onArchiveTask).toHaveBeenCalledWith('task1');
      expect(mockProps.onDeleteTask).not.toHaveBeenCalled();
    });

    it('still deletes when the user chooses Delete anyway', async () => {
      render(<TasksPage {...mockProps} />);

      fireEvent.click(screen.getAllByLabelText('Delete task')[0]);
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete anyway' }));

      await waitFor(() => {
        expect(mockProps.onDeleteTask).toHaveBeenCalledWith('task1');
      });
      expect(mockProps.onArchiveTask).not.toHaveBeenCalled();
    });

    it('is a plain confirmation for a task with no tracked time', async () => {
      render(<TasksPage {...mockProps} />);

      fireEvent.click(screen.getAllByLabelText('Delete task')[1]);
      const dialog = await screen.findByRole('dialog');

      expect(within(dialog).queryByRole('button', { name: 'Archive instead' })).not.toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

      await waitFor(() => {
        expect(mockProps.onDeleteTask).toHaveBeenCalledWith('task2');
      });
    });

    it('does nothing when cancelled', async () => {
      render(<TasksPage {...mockProps} />);

      fireEvent.click(screen.getAllByLabelText('Delete task')[0]);
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      expect(mockProps.onDeleteTask).not.toHaveBeenCalled();
      expect(mockProps.onArchiveTask).not.toHaveBeenCalled();
    });
  });

  it('opens add task dialog when add button is clicked', async () => {
    render(<TasksPage {...mockProps} />);

    fireEvent.click(screen.getByText('Add Task'));

    await waitFor(() => {
      expect(screen.getByTestId('add-task-dialog')).toBeInTheDocument();
    });
  });

  it('calls onAddTask when saving new task', async () => {
    const mockOnAddTask = vi.fn().mockResolvedValue(null); // Return null to avoid auto-selection
    render(<TasksPage {...mockProps} onAddTask={mockOnAddTask} />);

    fireEvent.click(screen.getByText('Add Task'));

    await waitFor(() => {
      expect(screen.getByTestId('add-task-dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Task'));

    await waitFor(() => {
      expect(mockOnAddTask).toHaveBeenCalledWith({
        name: 'New Task',
        hourlyRate: 50,
      });
    });
  });

  it('opens edit task dialog from the row edit button', async () => {
    render(<TasksPage {...mockProps} />);

    const editButtons = screen.getAllByLabelText('Edit task');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId('edit-task-dialog')).toBeInTheDocument();
    });
  });

  it('calls onUpdateTask when saving task changes', async () => {
    const mockOnUpdateTask = vi.fn().mockResolvedValue({ id: 'task1', name: 'Updated Task' });
    render(<TasksPage {...mockProps} onUpdateTask={mockOnUpdateTask} />);

    const editButtons = screen.getAllByLabelText('Edit task');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId('edit-task-dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockOnUpdateTask).toHaveBeenCalledWith('task1', {
        name: 'Updated Task',
        hourlyRate: 60,
      });
    });
  });

  it('opens edit time entry dialog when edit entry is clicked', async () => {
    render(<TasksPage {...mockProps} />);

    fireEvent.click(screen.getByText('Edit Entry'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-time-entry-dialog')).toBeInTheDocument();
    });
  });

  it('calls onUpdateEntry when saving time entry changes', async () => {
    const mockOnUpdateEntry = vi.fn();
    render(<TasksPage {...mockProps} onUpdateEntry={mockOnUpdateEntry} />);

    fireEvent.click(screen.getByText('Edit Entry'));

    await waitFor(() => {
      expect(screen.getByTestId('edit-time-entry-dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Entry'));

    await waitFor(() => {
      // The page passes the dialog payload through unchanged.
      expect(mockOnUpdateEntry).toHaveBeenCalledWith({
        id: 'entry1',
        taskName: 'Updated Task',
        durationMs: 3600000,
      });
    });
  });

  it('opens delete confirmation when delete entry is clicked', async () => {
    render(<TasksPage {...mockProps} />);

    fireEvent.click(screen.getByText('Delete Entry'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
  });

  it('calls onDeleteEntry when delete is confirmed', async () => {
    const mockOnDeleteEntry = vi.fn();
    render(<TasksPage {...mockProps} onDeleteEntry={mockOnDeleteEntry} />);

    fireEvent.click(screen.getByText('Delete Entry'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Confirm'));

    await waitFor(() => {
      expect(mockOnDeleteEntry).toHaveBeenCalledWith('entry1');
    });
  });

  it('lets you add a task past the old 10-task free limit with no upgrade prompt', async () => {
    const manyTasks: Task[] = Array.from({ length: 12 }, (_, i) => ({
      ...mockTasks[0],
      id: `task${i + 1}`,
      name: `Task ${i + 1}`,
    }));

    render(<TasksPage {...mockProps} tasks={manyTasks} />);

    expect(screen.queryByText(/Tasks: \d+\/\d+/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Add Task'));

    await waitFor(() => {
      expect(screen.getByTestId('add-task-dialog')).toBeInTheDocument();
    });
    expect(screen.queryByText(/upgrade/i)).not.toBeInTheDocument();
  });

  it('shows empty state when no tasks are available', () => {
    render(<TasksPage {...mockProps} tasks={[]} />);

    expect(screen.getByText(/No tasks created yet/)).toBeInTheDocument();
    expect(screen.getByText('Select a Task')).toBeInTheDocument();
    expect(screen.getByText(/Select a task to view details and time entries/)).toBeInTheDocument();
    expect(screen.getByText(/For notes management, visit the Notes page/)).toBeInTheDocument();
  });

  it('auto-selects newly created task', async () => {
    const newTask = {
      id: 'task4',
      name: 'New Task',
      hourlyRate: 50,
      defaultNoteTemplateId: null,
      createdAt: '2024-01-01T12:00:00Z',
      updatedAt: '2024-01-01T12:00:00Z'
    };
    const mockOnAddTask = vi.fn().mockResolvedValue(newTask);

    // Start with the original tasks, then add the new one
    const updatedTasks = [...mockTasks, newTask];

    render(<TasksPage {...mockProps} tasks={updatedTasks} onAddTask={mockOnAddTask} />);

    fireEvent.click(screen.getByText('Add Task'));

    await waitFor(() => {
      expect(screen.getByTestId('add-task-dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Task'));

    await waitFor(() => {
      expect(mockOnAddTask).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('New Task Details')).toBeInTheDocument();
    });
  });
});
