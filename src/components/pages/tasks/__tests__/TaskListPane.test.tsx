/**
 * TaskListPane Component Tests
 *
 * Covers the master task list: active/archived sectioning, search spanning
 * both sections, row selection, and the per-row edit/archive/delete actions
 * (which must not change the selection).
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { TaskListPane } from '../TaskListPane';
import { Task } from '../../../../types/task';

vi.mock('../../../ui', () => ({
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

describe('TaskListPane', () => {
  const activeAlpha: Task = {
    id: 'task-alpha',
    name: 'Alpha Work',
    hourlyRate: 50,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
  const activeBeta: Task = {
    id: 'task-beta',
    name: 'Beta Work',
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
  };
  const archivedGamma: Task = {
    id: 'task-gamma',
    name: 'Gamma Archived',
    hourlyRate: 40,
    isArchived: true,
    archivedAt: '2024-02-01T00:00:00Z',
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-02-01T00:00:00Z',
  };

  const defaultProps = {
    tasks: [activeAlpha, activeBeta, archivedGamma],
    selectedTask: null as Task | null,
    onSelectTask: vi.fn(),
    onAddClick: vi.fn(),
    onEditTask: vi.fn(),
    onDeleteTask: vi.fn(),
    onArchiveTask: vi.fn(),
    onUnarchiveTask: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders active rows and a labeled archived section', () => {
    render(<TaskListPane {...defaultProps} />);

    expect(screen.getByText('Alpha Work')).toBeInTheDocument();
    expect(screen.getByText('Beta Work')).toBeInTheDocument();
    expect(screen.getByText('Archived (1)')).toBeInTheDocument();
    expect(screen.getByText('Gamma Archived')).toBeInTheDocument();
  });

  it('omits the archived section when no tasks are archived', () => {
    render(<TaskListPane {...defaultProps} tasks={[activeAlpha, activeBeta]} />);

    expect(screen.queryByText(/Archived \(/)).not.toBeInTheDocument();
  });

  it('search spans both active and archived sections', () => {
    render(<TaskListPane {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 'gamma' } });

    expect(screen.queryByText('Alpha Work')).not.toBeInTheDocument();
    expect(screen.queryByText('Beta Work')).not.toBeInTheDocument();
    expect(screen.getByText('Archived (1)')).toBeInTheDocument();
    expect(screen.getByText('Gamma Archived')).toBeInTheDocument();
  });

  it('selects a task when its row is clicked', () => {
    render(<TaskListPane {...defaultProps} />);

    fireEvent.click(screen.getByText('Beta Work'));

    expect(defaultProps.onSelectTask).toHaveBeenCalledWith(activeBeta);
  });

  it('archived rows stay selectable', () => {
    render(<TaskListPane {...defaultProps} />);

    fireEvent.click(screen.getByText('Gamma Archived'));

    expect(defaultProps.onSelectTask).toHaveBeenCalledWith(archivedGamma);
  });

  it('shows Archive on active rows and Unarchive on archived rows', () => {
    render(<TaskListPane {...defaultProps} />);

    expect(screen.getAllByLabelText('Archive task')).toHaveLength(2);
    expect(screen.getAllByLabelText('Unarchive task')).toHaveLength(1);
  });

  it('fires onArchiveTask without selecting the row', () => {
    render(<TaskListPane {...defaultProps} />);

    fireEvent.click(screen.getAllByLabelText('Archive task')[0]);

    expect(defaultProps.onArchiveTask).toHaveBeenCalledWith(activeAlpha);
    expect(defaultProps.onSelectTask).not.toHaveBeenCalled();
  });

  it('fires onUnarchiveTask for archived rows without selecting', () => {
    render(<TaskListPane {...defaultProps} />);

    fireEvent.click(screen.getByLabelText('Unarchive task'));

    expect(defaultProps.onUnarchiveTask).toHaveBeenCalledWith(archivedGamma);
    expect(defaultProps.onSelectTask).not.toHaveBeenCalled();
  });

  it('fires onEditTask and onDeleteTask from row buttons without selecting', () => {
    render(<TaskListPane {...defaultProps} />);

    fireEvent.click(screen.getAllByLabelText('Edit task')[0]);
    expect(defaultProps.onEditTask).toHaveBeenCalledWith(activeAlpha);

    fireEvent.click(screen.getAllByLabelText('Delete task')[1]);
    expect(defaultProps.onDeleteTask).toHaveBeenCalledWith('task-beta');

    expect(defaultProps.onSelectTask).not.toHaveBeenCalled();
  });

  it('hides action buttons when their callbacks are not provided', () => {
    render(
      <TaskListPane
        {...defaultProps}
        onEditTask={undefined}
        onDeleteTask={undefined}
        onArchiveTask={undefined}
        onUnarchiveTask={undefined}
      />
    );

    expect(screen.queryByLabelText('Edit task')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Delete task')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Archive task')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Unarchive task')).not.toBeInTheDocument();
  });

  it('calls onAddClick from the header button', () => {
    render(<TaskListPane {...defaultProps} />);

    fireEvent.click(screen.getByText('Add Task'));

    expect(defaultProps.onAddClick).toHaveBeenCalled();
  });

  it('shows the no-tasks empty state for an empty list', () => {
    render(<TaskListPane {...defaultProps} tasks={[]} />);

    expect(screen.getByText(/No tasks created yet/)).toBeInTheDocument();
  });

  it('shows the no-match empty state when search finds nothing', () => {
    render(<TaskListPane {...defaultProps} />);

    fireEvent.change(screen.getByLabelText('Search tasks'), { target: { value: 'zzz' } });

    expect(screen.getByText(/No tasks match your search criteria/)).toBeInTheDocument();
  });
});
