/**
 * TimeEntryForm Timer Clearing Unit Tests
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TimeEntryForm } from '../TimeEntryForm';
import { Task } from '../../../types/task';
import { TimeEntry } from '../../../types/timer';

// Mock the UI components
jest.mock('../../ui', () => ({
  TaskSelector: ({ value, onChange, disabled }: any) => (
    <input
      data-testid="task-selector"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder="Select task"
    />
  ),
  TimerButton: ({ isRunning, onStart, onStop, disabled }: any) => (
    <button
      data-testid="timer-button"
      onClick={isRunning ? onStop : onStart}
      disabled={disabled}
    >
      {isRunning ? 'Stop' : 'Start'}
    </button>
  ),
  TimerDisplay: ({ taskName }: any) => (
    <div data-testid="timer-display">Timer: {taskName}</div>
  ),
  TimeInput: () => <input data-testid="time-input" />,
  ActionButton: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

// Mock the hooks
jest.mock('../../../hooks/useTimer', () => ({
  useTimer: () => 3600000, // 1 hour in milliseconds
}));

// Mock the utils
jest.mock('../../../utils/formatters', () => ({
  formatTime: (_ms: number) => '01:00:00',
  parseTimeInput: (_time: string) => 3600000,
}));

jest.mock('../../../utils/dateHelpers', () => ({
  formatDateTimeLocal: (_date: Date) => '2023-01-01T10:00',
  formatDateString: (_date: Date) => '2023-01-01',
}));


describe('TimeEntryForm Timer Clearing', () => {
  const mockOnSave = jest.fn();
  const mockOnUpdateActiveEntry = jest.fn();
  const mockOnCreateNewTask = jest.fn();

  const mockTasks: Task[] = [
    {
      id: '1',
      name: 'Test Task',
      createdAt: '2023-01-01T10:00:00Z',
      updatedAt: '2023-01-01T10:00:00Z',
    },
  ];

  const mockTimeEntries: TimeEntry[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears task selector when timer is stopped', async () => {
    const mockActiveEntry: TimeEntry = {
      id: '1',
      taskName: 'Test Task',
      startTime: new Date('2023-01-01T10:00:00Z'),
      isRunning: true,
      date: '2023-01-01',
    };

    const { rerender } = render(
      <TimeEntryForm
        onSave={mockOnSave}
        predefinedTasks={mockTasks}
        activeEntry={mockActiveEntry}
        onUpdateActiveEntry={mockOnUpdateActiveEntry}
        onCreateNewTask={mockOnCreateNewTask}
        timeEntries={mockTimeEntries}
      />
    );

    // Verify timer is running and task is selected
    expect(screen.getByTestId('task-selector')).toHaveValue('Test Task');
    expect(screen.getByTestId('timer-button')).toHaveTextContent('Stop');

    // Stop the timer
    fireEvent.click(screen.getByTestId('timer-button'));

    // Verify onSave was called
    expect(mockOnSave).toHaveBeenCalled();
    expect(mockOnUpdateActiveEntry).toHaveBeenCalledWith(null);

    // Rerender with no active entry to simulate the timer being stopped
    rerender(
      <TimeEntryForm
        onSave={mockOnSave}
        predefinedTasks={mockTasks}
        activeEntry={null}
        onUpdateActiveEntry={mockOnUpdateActiveEntry}
        onCreateNewTask={mockOnCreateNewTask}
        timeEntries={mockTimeEntries}
      />
    );

    // Verify task selector is cleared
    await waitFor(() => {
      expect(screen.getByTestId('task-selector')).toHaveValue('');
    });

    // Verify timer button shows "Start" again
    expect(screen.getByTestId('timer-button')).toHaveTextContent('Start');
  });

  it('resets all form fields when timer is stopped', async () => {
    const mockActiveEntry: TimeEntry = {
      id: '1',
      taskName: 'Test Task',
      startTime: new Date('2023-01-01T10:00:00Z'),
      isRunning: true,
      date: '2023-01-01',
    };

    const { rerender } = render(
      <TimeEntryForm
        onSave={mockOnSave}
        predefinedTasks={mockTasks}
        activeEntry={mockActiveEntry}
        onUpdateActiveEntry={mockOnUpdateActiveEntry}
        onCreateNewTask={mockOnCreateNewTask}
        timeEntries={mockTimeEntries}
      />
    );

    // Stop the timer
    fireEvent.click(screen.getByTestId('timer-button'));

    // Rerender with no active entry
    rerender(
      <TimeEntryForm
        onSave={mockOnSave}
        predefinedTasks={mockTasks}
        activeEntry={null}
        onUpdateActiveEntry={mockOnUpdateActiveEntry}
        onCreateNewTask={mockOnCreateNewTask}
        timeEntries={mockTimeEntries}
      />
    );

    // Verify all form fields are reset
    await waitFor(() => {
      expect(screen.getByTestId('task-selector')).toHaveValue('');
    });

    // Verify start time input is visible (timer not running)
    expect(screen.getByLabelText(/Start Time/)).toBeInTheDocument();
    
    // Verify timer display is not visible
    expect(screen.queryByTestId('timer-display')).not.toBeInTheDocument();
  });

  it('maintains task selection while timer is running', () => {
    const mockActiveEntry: TimeEntry = {
      id: '1',
      taskName: 'Test Task',
      startTime: new Date('2023-01-01T10:00:00Z'),
      isRunning: true,
      date: '2023-01-01',
    };

    render(
      <TimeEntryForm
        onSave={mockOnSave}
        predefinedTasks={mockTasks}
        activeEntry={mockActiveEntry}
        onUpdateActiveEntry={mockOnUpdateActiveEntry}
        onCreateNewTask={mockOnCreateNewTask}
        timeEntries={mockTimeEntries}
      />
    );

    // Verify task selector maintains value while running
    expect(screen.getByTestId('task-selector')).toHaveValue('Test Task');
    expect(screen.getByTestId('task-selector')).toBeDisabled();
    expect(screen.getByTestId('timer-button')).toHaveTextContent('Stop');
  });

  it('allows new task selection after timer is stopped', async () => {
    // Start with no active entry
    render(
      <TimeEntryForm
        onSave={mockOnSave}
        predefinedTasks={mockTasks}
        activeEntry={null}
        onUpdateActiveEntry={mockOnUpdateActiveEntry}
        onCreateNewTask={mockOnCreateNewTask}
        timeEntries={mockTimeEntries}
      />
    );

    // Verify task selector is empty and enabled
    expect(screen.getByTestId('task-selector')).toHaveValue('');
    expect(screen.getByTestId('task-selector')).not.toBeDisabled();

    // Select a task
    fireEvent.change(screen.getByTestId('task-selector'), {
      target: { value: 'New Task' },
    });

    // Verify task is selected
    expect(screen.getByTestId('task-selector')).toHaveValue('New Task');

    // Start timer should be enabled
    expect(screen.getByTestId('timer-button')).not.toBeDisabled();
  });

  it('handles stopping timer without active entry gracefully', () => {
    render(
      <TimeEntryForm
        onSave={mockOnSave}
        predefinedTasks={mockTasks}
        activeEntry={null}
        onUpdateActiveEntry={mockOnUpdateActiveEntry}
        onCreateNewTask={mockOnCreateNewTask}
        timeEntries={mockTimeEntries}
      />
    );

    // Timer button should show "Start" and be disabled (no task selected)
    expect(screen.getByTestId('timer-button')).toHaveTextContent('Start');
    expect(screen.getByTestId('timer-button')).toBeDisabled();

    // Clicking shouldn't cause any errors
    fireEvent.click(screen.getByTestId('timer-button'));

    // No save or update calls should be made
    expect(mockOnSave).not.toHaveBeenCalled();
    expect(mockOnUpdateActiveEntry).not.toHaveBeenCalled();
  });
});
