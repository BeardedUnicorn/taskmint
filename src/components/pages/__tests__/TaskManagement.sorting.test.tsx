/**
 * TaskManagement Sorting Unit Tests
 */

import { render, screen } from '@testing-library/react';
import { TaskManagement } from '../TaskManagement';
import { Task } from '../../../types/task';

// Mock the UI components
jest.mock('../../ui', () => ({
  ActionButton: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  FormDialog: ({ children }: any) => <div>{children}</div>,
  ConfirmDialog: () => <div>Confirm Dialog</div>,
  CurrencyInput: ({ label, value, onChange }: any) => (
    <input
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

jest.mock('../../ui/tables/TaskRow', () => ({
  TaskRow: ({ task }: { task: Task }) => (
    <tr data-testid={`task-row-${task.id}`}>
      <td>{task.name}</td>
      <td>{task.updatedAt}</td>
    </tr>
  ),
}));

jest.mock('../../features/tasks', () => ({
  TaskDetail: () => <div>Task Detail</div>,
}));

describe('TaskManagement Sorting', () => {
  const mockOnAddTask = jest.fn();
  const mockOnUpdateTask = jest.fn();
  const mockOnDeleteTask = jest.fn();

  const mockTasks: Task[] = [
    {
      id: '1',
      name: 'Task A',
      createdAt: '2023-01-01T10:00:00Z',
      updatedAt: '2023-01-01T10:00:00Z',
    },
    {
      id: '2',
      name: 'Task B',
      createdAt: '2023-01-02T10:00:00Z',
      updatedAt: '2023-01-03T10:00:00Z', // Most recently updated
    },
    {
      id: '3',
      name: 'Task C',
      createdAt: '2023-01-03T10:00:00Z',
      updatedAt: '2023-01-02T10:00:00Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sorts tasks by updatedAt in descending order (most recent first)', () => {
    render(
      <TaskManagement
        tasks={mockTasks}
        onAddTask={mockOnAddTask}
        onUpdateTask={mockOnUpdateTask}
        onDeleteTask={mockOnDeleteTask}
      />
    );

    const taskRows = screen.getAllByTestId(/task-row-/);
    
    // Should be ordered by updatedAt descending: Task B, Task C, Task A
    expect(taskRows[0]).toHaveAttribute('data-testid', 'task-row-2'); // Task B (2023-01-03)
    expect(taskRows[1]).toHaveAttribute('data-testid', 'task-row-3'); // Task C (2023-01-02)
    expect(taskRows[2]).toHaveAttribute('data-testid', 'task-row-1'); // Task A (2023-01-01)
  });

  it('handles tasks with same updatedAt correctly', () => {
    const tasksWithSameDate: Task[] = [
      {
        id: '1',
        name: 'Task A',
        createdAt: '2023-01-01T10:00:00Z',
        updatedAt: '2023-01-01T10:00:00Z',
      },
      {
        id: '2',
        name: 'Task B',
        createdAt: '2023-01-01T11:00:00Z',
        updatedAt: '2023-01-01T10:00:00Z', // Same updatedAt
      },
    ];

    render(
      <TaskManagement
        tasks={tasksWithSameDate}
        onAddTask={mockOnAddTask}
        onUpdateTask={mockOnUpdateTask}
        onDeleteTask={mockOnDeleteTask}
      />
    );

    const taskRows = screen.getAllByTestId(/task-row-/);
    expect(taskRows).toHaveLength(2);
    // Both tasks should be rendered, order may vary for same dates
  });

  it('handles empty task list', () => {
    render(
      <TaskManagement
        tasks={[]}
        onAddTask={mockOnAddTask}
        onUpdateTask={mockOnUpdateTask}
        onDeleteTask={mockOnDeleteTask}
      />
    );

    expect(screen.getByText('No tasks created yet. Click "Add New Task" to get started.')).toBeInTheDocument();
  });

  it('sorts single task correctly', () => {
    const singleTask: Task[] = [
      {
        id: '1',
        name: 'Only Task',
        createdAt: '2023-01-01T10:00:00Z',
        updatedAt: '2023-01-01T10:00:00Z',
      },
    ];

    render(
      <TaskManagement
        tasks={singleTask}
        onAddTask={mockOnAddTask}
        onUpdateTask={mockOnUpdateTask}
        onDeleteTask={mockOnDeleteTask}
      />
    );

    const taskRows = screen.getAllByTestId(/task-row-/);
    expect(taskRows).toHaveLength(1);
    expect(taskRows[0]).toHaveAttribute('data-testid', 'task-row-1');
  });

  it('maintains sort order when tasks are updated', () => {
    const { rerender } = render(
      <TaskManagement
        tasks={mockTasks}
        onAddTask={mockOnAddTask}
        onUpdateTask={mockOnUpdateTask}
        onDeleteTask={mockOnDeleteTask}
      />
    );

    // Update Task A to have the most recent updatedAt
    const updatedTasks: Task[] = [
      {
        ...mockTasks[0],
        updatedAt: '2023-01-04T10:00:00Z', // Now most recent
      },
      mockTasks[1],
      mockTasks[2],
    ];

    rerender(
      <TaskManagement
        tasks={updatedTasks}
        onAddTask={mockOnAddTask}
        onUpdateTask={mockOnUpdateTask}
        onDeleteTask={mockOnDeleteTask}
      />
    );

    const taskRows = screen.getAllByTestId(/task-row-/);
    
    // Now Task A should be first
    expect(taskRows[0]).toHaveAttribute('data-testid', 'task-row-1'); // Task A (2023-01-04)
    expect(taskRows[1]).toHaveAttribute('data-testid', 'task-row-2'); // Task B (2023-01-03)
    expect(taskRows[2]).toHaveAttribute('data-testid', 'task-row-3'); // Task C (2023-01-02)
  });
});
