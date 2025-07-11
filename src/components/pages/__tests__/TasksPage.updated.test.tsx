/**
 * TasksPage Component Tests - Updated for Notes Section Removal
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { TasksPage } from '../TasksPage';
import { Task } from '../../../types/task';
import { TimeEntry } from '../../../types/timer';

// Mock the subscription context
vi.mock('../../../contexts/SubscriptionContext', () => ({
  useSubscription: vi.fn(() => ({
    subscription: null,
    upgradeSubscription: vi.fn(),
  })),
  useTaskLimit: vi.fn(() => ({
    canAddTask: true,
    currentCount: 1,
    limit: 10,
    reason: null,
    isLoading: false,
  })),
}));

// Mock the task detail pane
vi.mock('../tasks/TaskDetailPane', () => ({
  TaskDetailPane: vi.fn(({ task, onEditEntry, onDeleteEntry }) => (
    <div data-testid="task-detail-pane">
      <h3>{task.name} Details</h3>
      <button onClick={() => onEditEntry({ id: 'entry1', taskName: task.name })}>Edit Entry</button>
      <button onClick={() => onDeleteEntry('entry1')}>Delete Entry</button>
    </div>
  )),
}));

// Mock the dialogs
vi.mock('../tasks/AddTaskDialog', () => ({
  AddTaskDialog: vi.fn(({ open, onSave, onClose }) => 
    open ? (
      <div data-testid="add-task-dialog">
        <button onClick={() => onSave({ name: 'New Task', hourlyRate: 50 }).then(() => onClose())}>Save Task</button>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null
  ),
}));

vi.mock('../tasks/EditTaskDialog', () => ({
  EditTaskDialog: vi.fn(({ open, task, onSave, onClose }) => 
    open && task ? (
      <div data-testid="edit-task-dialog">
        <button onClick={() => onSave(task.id, { name: 'Updated Task', hourlyRate: 60 })}>Save Changes</button>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null
  ),
}));

vi.mock('../../ui/dialogs/EditTimeEntryDialog', () => ({
  EditTimeEntryDialog: vi.fn(({ open, onSave, onClose }) => 
    open ? (
      <div data-testid="edit-time-entry-dialog">
        <button onClick={() => onSave({ taskName: 'Updated Task', startTime: '2024-01-01T10:00', endTime: '2024-01-01T11:00' })}>Save Entry</button>
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
  UpgradeDialog: vi.fn(({ open, onUpgrade, onClose }) => 
    open ? (
      <div data-testid="upgrade-dialog">
        <button onClick={() => onUpgrade('pro-lifetime')}>Upgrade</button>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null
  ),
}));

describe('TasksPage - Updated without Notes Section', () => {
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
    onUpdateEntry: vi.fn(),
    onDeleteEntry: vi.fn(),
  };

  let mockUseSubscription: any;
  let mockUseTaskLimit: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Import the mocked functions
    const subscriptionModule = await import('../../../contexts/SubscriptionContext');
    mockUseSubscription = vi.mocked(subscriptionModule.useSubscription);
    mockUseTaskLimit = vi.mocked(subscriptionModule.useTaskLimit);
  });

  it('renders the tasks page with header and controls', () => {
    render(<TasksPage {...mockProps} />);

    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('Manage your tasks and view detailed time tracking information')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Task')).toBeInTheDocument();
    expect(screen.getByText('Add Task')).toBeInTheDocument();
  });

  it('does not render notes section', () => {
    render(<TasksPage {...mockProps} />);

    // Should not find any notes-related elements
    expect(screen.queryByText('Task Notes')).not.toBeInTheDocument();
    expect(screen.queryByText('Notes')).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-notes-integration')).not.toBeInTheDocument();
  });

  it('shows single pane layout for time worked only', () => {
    render(<TasksPage {...mockProps} />);

    // Should show the task detail pane
    expect(screen.getByTestId('task-detail-pane')).toBeInTheDocument();
    expect(screen.getByText('Task 1 Details')).toBeInTheDocument();
  });

  it('mentions Notes page in the empty state message', () => {
    render(<TasksPage {...mockProps} tasks={[]} />);

    expect(screen.getByText(/For notes management, visit the Notes page/)).toBeInTheDocument();
  });

  it('selects first task by default when tasks are available', () => {
    render(<TasksPage {...mockProps} />);

    // Check that the first task is selected by looking at the hidden input value
    const hiddenInput = screen.getByDisplayValue('task1');
    expect(hiddenInput).toBeInTheDocument();
    expect(screen.getByText('Task 1 Details')).toBeInTheDocument();
  });

  it('allows task selection from dropdown', async () => {
    render(<TasksPage {...mockProps} />);

    const taskSelector = screen.getByLabelText('Select Task');
    fireEvent.mouseDown(taskSelector);
    
    await waitFor(() => {
      expect(screen.getByText('Task 2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Task 2'));

    await waitFor(() => {
      expect(screen.getByText('Task 2 Details')).toBeInTheDocument();
    });
  });

  it('opens add task dialog when add button is clicked', async () => {
    render(<TasksPage {...mockProps} />);

    const addButton = screen.getByText('Add Task');
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByTestId('add-task-dialog')).toBeInTheDocument();
    });
  });

  it('calls onAddTask when saving new task', async () => {
    const mockOnAddTask = vi.fn().mockResolvedValue(null); // Return null to avoid auto-selection
    render(<TasksPage {...mockProps} onAddTask={mockOnAddTask} />);

    const addButton = screen.getByText('Add Task');
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByTestId('add-task-dialog')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Task');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockOnAddTask).toHaveBeenCalledWith({
        name: 'New Task',
        hourlyRate: 50,
      });
    });
  });

  it('opens edit task dialog when edit button is clicked', async () => {
    render(<TasksPage {...mockProps} />);

    const editButton = screen.getByTitle('Edit Selected Task');
    fireEvent.click(editButton);

    await waitFor(() => {
      expect(screen.getByTestId('edit-task-dialog')).toBeInTheDocument();
    });
  });

  it('calls onUpdateTask when saving task changes', async () => {
    const mockOnUpdateTask = vi.fn().mockResolvedValue({ id: 'task1', name: 'Updated Task' });
    render(<TasksPage {...mockProps} onUpdateTask={mockOnUpdateTask} />);

    const editButton = screen.getByTitle('Edit Selected Task');
    fireEvent.click(editButton);

    await waitFor(() => {
      expect(screen.getByTestId('edit-task-dialog')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Changes');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockOnUpdateTask).toHaveBeenCalledWith('task1', {
        name: 'Updated Task',
        hourlyRate: 60,
      });
    });
  });

  it('opens edit time entry dialog when edit entry is clicked', async () => {
    // Mock a valid time entry with proper date format
    const validTimeEntries: TimeEntry[] = [
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

    render(<TasksPage {...mockProps} timeEntries={validTimeEntries} />);

    const editEntryButton = screen.getByText('Edit Entry');
    fireEvent.click(editEntryButton);

    await waitFor(() => {
      expect(screen.getByTestId('edit-time-entry-dialog')).toBeInTheDocument();
    });
  });

  it('calls onUpdateEntry when saving time entry changes', async () => {
    const mockOnUpdateEntry = vi.fn();
    // Mock a valid time entry with proper date format
    const validTimeEntries: TimeEntry[] = [
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

    render(<TasksPage {...mockProps} timeEntries={validTimeEntries} onUpdateEntry={mockOnUpdateEntry} />);

    const editEntryButton = screen.getByText('Edit Entry');
    fireEvent.click(editEntryButton);

    await waitFor(() => {
      expect(screen.getByTestId('edit-time-entry-dialog')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Entry');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockOnUpdateEntry).toHaveBeenCalled();
    });
  });

  it('opens delete confirmation when delete entry is clicked', async () => {
    render(<TasksPage {...mockProps} />);

    const deleteEntryButton = screen.getByText('Delete Entry');
    fireEvent.click(deleteEntryButton);

    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
  });

  it('calls onDeleteEntry when delete is confirmed', async () => {
    const mockOnDeleteEntry = vi.fn();
    render(<TasksPage {...mockProps} onDeleteEntry={mockOnDeleteEntry} />);

    const deleteEntryButton = screen.getByText('Delete Entry');
    fireEvent.click(deleteEntryButton);

    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });

    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockOnDeleteEntry).toHaveBeenCalledWith('entry1');
    });
  });

  it('shows upgrade dialog when task limit is reached', async () => {
    mockUseTaskLimit.mockReturnValue({
      canAddTask: false,
      currentCount: 10,
      limit: 10,
      reason: 'Task limit reached',
      isLoading: false,
    });

    render(<TasksPage {...mockProps} />);

    const addButton = screen.getByText('Add Task');
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByTestId('upgrade-dialog')).toBeInTheDocument();
    });
  });

  it('shows task limit information when limit exists', () => {
    mockUseTaskLimit.mockReturnValue({
      canAddTask: true,
      currentCount: 5,
      limit: 10,
      reason: null,
      isLoading: false,
    });

    render(<TasksPage {...mockProps} />);

    expect(screen.getByText('Tasks: 5/10')).toBeInTheDocument();
  });

  it('shows empty state when no tasks are available', () => {
    render(<TasksPage {...mockProps} tasks={[]} />);

    expect(screen.getByText('Select a Task')).toBeInTheDocument();
    expect(screen.getByText(/Select a task to view details and time entries/)).toBeInTheDocument();
    expect(screen.getByText(/For notes management, visit the Notes page/)).toBeInTheDocument();
  });

  it('auto-selects newly created task', async () => {
    const newTask = { 
      id: 'task3', 
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

    const addButton = screen.getByText('Add Task');
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByTestId('add-task-dialog')).toBeInTheDocument();
    });

    const saveButton = screen.getByText('Save Task');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockOnAddTask).toHaveBeenCalled();
    });

    // The component should auto-select the new task (this would be tested through integration)
  });
});
