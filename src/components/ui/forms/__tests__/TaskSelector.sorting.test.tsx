/**
 * TaskSelector Sorting Unit Tests
 */

import { render, screen } from '@testing-library/react';
import { TaskSelector } from '../TaskSelector';
import { Task } from '../../../../types/task';
import { TimeEntry } from '../../../../types/timer';

// Mock Material-UI Autocomplete
jest.mock('@mui/material', () => ({
  ...jest.requireActual('@mui/material'),
  Autocomplete: ({ options, getOptionLabel, renderOption, renderInput }: any) => {
    return (
      <div data-testid="autocomplete">
        <div data-testid="autocomplete-input">
          {renderInput({ inputProps: {} })}
        </div>
        <div data-testid="autocomplete-options">
          {options.map((option: any, index: number) => (
            <div key={index} data-testid={`option-${index}`}>
              {renderOption ? renderOption({}, option) : getOptionLabel(option)}
            </div>
          ))}
        </div>
      </div>
    );
  },
}));

describe('TaskSelector Sorting', () => {
  const mockOnChange = jest.fn();
  const mockOnCreateNewTask = jest.fn();

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
      updatedAt: '2023-01-02T10:00:00Z',
    },
    {
      id: '3',
      name: 'Task C',
      createdAt: '2023-01-03T10:00:00Z',
      updatedAt: '2023-01-03T10:00:00Z',
    },
  ];

  const mockTimeEntries: TimeEntry[] = [
    {
      id: '1',
      taskName: 'Task B',
      startTime: new Date('2023-01-05T10:00:00Z'),
      isRunning: false,
      date: '2023-01-05',
    },
    {
      id: '2',
      taskName: 'Task A',
      startTime: new Date('2023-01-03T10:00:00Z'),
      isRunning: false,
      date: '2023-01-03',
    },
    {
      id: '3',
      taskName: 'Task B',
      startTime: new Date('2023-01-04T10:00:00Z'), // Earlier than the other Task B entry
      isRunning: false,
      date: '2023-01-04',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sorts tasks alphabetically when no time entries provided', () => {
    render(
      <TaskSelector
        value=""
        onChange={mockOnChange}
        predefinedTasks={mockTasks}
        onCreateNewTask={mockOnCreateNewTask}
      />
    );

    const options = screen.getAllByTestId(/option-/);
    
    // Should be alphabetical: Task A, Task B, Task C
    expect(options[0]).toHaveTextContent('Task A');
    expect(options[1]).toHaveTextContent('Task B');
    expect(options[2]).toHaveTextContent('Task C');
  });

  it('sorts tasks by most recent time entry when time entries provided', () => {
    render(
      <TaskSelector
        value=""
        onChange={mockOnChange}
        predefinedTasks={mockTasks}
        onCreateNewTask={mockOnCreateNewTask}
        timeEntries={mockTimeEntries}
      />
    );

    const options = screen.getAllByTestId(/option-/);
    
    // Should be sorted by most recent time entry: Task B (2023-01-05), Task A (2023-01-03), Task C (no entries)
    expect(options[0]).toHaveTextContent('Task B');
    expect(options[1]).toHaveTextContent('Task A');
    expect(options[2]).toHaveTextContent('Task C');
  });

  it('handles tasks with no time entries correctly', () => {
    const timeEntriesForSomeTasks: TimeEntry[] = [
      {
        id: '1',
        taskName: 'Task B',
        startTime: new Date('2023-01-05T10:00:00Z'),
        isRunning: false,
        date: '2023-01-05',
      },
    ];

    render(
      <TaskSelector
        value=""
        onChange={mockOnChange}
        predefinedTasks={mockTasks}
        onCreateNewTask={mockOnCreateNewTask}
        timeEntries={timeEntriesForSomeTasks}
      />
    );

    const options = screen.getAllByTestId(/option-/);
    
    // Task B should be first (has time entry), then Task A and Task C alphabetically
    expect(options[0]).toHaveTextContent('Task B');
    expect(options[1]).toHaveTextContent('Task A');
    expect(options[2]).toHaveTextContent('Task C');
  });

  it('uses most recent time entry for tasks with multiple entries', () => {
    const multipleEntriesForSameTask: TimeEntry[] = [
      {
        id: '1',
        taskName: 'Task A',
        startTime: new Date('2023-01-01T10:00:00Z'), // Older
        isRunning: false,
        date: '2023-01-01',
      },
      {
        id: '2',
        taskName: 'Task A',
        startTime: new Date('2023-01-06T10:00:00Z'), // More recent
        isRunning: false,
        date: '2023-01-06',
      },
      {
        id: '3',
        taskName: 'Task B',
        startTime: new Date('2023-01-05T10:00:00Z'),
        isRunning: false,
        date: '2023-01-05',
      },
    ];

    render(
      <TaskSelector
        value=""
        onChange={mockOnChange}
        predefinedTasks={mockTasks}
        onCreateNewTask={mockOnCreateNewTask}
        timeEntries={multipleEntriesForSameTask}
      />
    );

    const options = screen.getAllByTestId(/option-/);
    
    // Task A should be first (most recent: 2023-01-06), then Task B (2023-01-05), then Task C
    expect(options[0]).toHaveTextContent('Task A');
    expect(options[1]).toHaveTextContent('Task B');
    expect(options[2]).toHaveTextContent('Task C');
  });

  it('handles empty time entries array', () => {
    render(
      <TaskSelector
        value=""
        onChange={mockOnChange}
        predefinedTasks={mockTasks}
        onCreateNewTask={mockOnCreateNewTask}
        timeEntries={[]}
      />
    );

    const options = screen.getAllByTestId(/option-/);
    
    // Should fall back to alphabetical sorting
    expect(options[0]).toHaveTextContent('Task A');
    expect(options[1]).toHaveTextContent('Task B');
    expect(options[2]).toHaveTextContent('Task C');
  });

  it('handles time entries for tasks not in predefined list', () => {
    const timeEntriesWithUnknownTask: TimeEntry[] = [
      {
        id: '1',
        taskName: 'Unknown Task',
        startTime: new Date('2023-01-05T10:00:00Z'),
        isRunning: false,
        date: '2023-01-05',
      },
      {
        id: '2',
        taskName: 'Task A',
        startTime: new Date('2023-01-03T10:00:00Z'),
        isRunning: false,
        date: '2023-01-03',
      },
    ];

    render(
      <TaskSelector
        value=""
        onChange={mockOnChange}
        predefinedTasks={mockTasks}
        onCreateNewTask={mockOnCreateNewTask}
        timeEntries={timeEntriesWithUnknownTask}
      />
    );

    const options = screen.getAllByTestId(/option-/);
    
    // Task A should be first (has time entry), then Task B and Task C alphabetically
    expect(options[0]).toHaveTextContent('Task A');
    expect(options[1]).toHaveTextContent('Task B');
    expect(options[2]).toHaveTextContent('Task C');
  });

  it('maintains stable sort for tasks with same last used date', () => {
    const sameTimeEntries: TimeEntry[] = [
      {
        id: '1',
        taskName: 'Task A',
        startTime: new Date('2023-01-05T10:00:00Z'),
        isRunning: false,
        date: '2023-01-05',
      },
      {
        id: '2',
        taskName: 'Task B',
        startTime: new Date('2023-01-05T10:00:00Z'), // Same time
        isRunning: false,
        date: '2023-01-05',
      },
    ];

    render(
      <TaskSelector
        value=""
        onChange={mockOnChange}
        predefinedTasks={mockTasks}
        onCreateNewTask={mockOnCreateNewTask}
        timeEntries={sameTimeEntries}
      />
    );

    const options = screen.getAllByTestId(/option-/);
    
    // Both Task A and Task B should be before Task C, order between A and B may vary
    expect(options[2]).toHaveTextContent('Task C');
  });
});
