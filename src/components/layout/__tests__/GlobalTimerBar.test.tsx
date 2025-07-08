import { vi, describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '../../../__tests__/setup/test-helpers';
import { GlobalTimerBar } from '../GlobalTimerBar';
import { TimeEntry } from '../../../types/timer';
import { Task } from '../../../types/task';

describe('GlobalTimerBar', () => {
  const mockTasks: Task[] = [{ id: '1', name: 'Task 1', createdAt: '', updatedAt: '' }];
  const mockActiveEntry: TimeEntry = {
    id: '1',
    taskName: 'Task 1',
    startTime: new Date(),
    isRunning: true,
    date: '2025-07-08',
  };

  it('renders start controls when no active entry', () => {
    render(<GlobalTimerBar activeEntry={null} predefinedTasks={mockTasks} onStart={vi.fn()} onStop={vi.fn()} />);
    expect(screen.getByText('Start Timer:')).toBeInTheDocument();
    expect(screen.getByLabelText('Task')).toBeInTheDocument();
    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  it('renders running state with buttons when active entry', () => {
    const onOpenNotes = vi.fn();
    const onOpenTaskNote = vi.fn();
    render(<GlobalTimerBar activeEntry={mockActiveEntry} predefinedTasks={mockTasks} onStart={vi.fn()} onStop={vi.fn()} onOpenNotes={onOpenNotes} onOpenTaskNote={onOpenTaskNote} />);
    expect(screen.getByText('Working on:')).toBeInTheDocument();
    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Task Note')).toBeInTheDocument();
    expect(screen.getByText('Stop')).toBeInTheDocument();
  });

  it('calls onOpenNotes when Notes button clicked', () => {
    const onOpenNotes = vi.fn();
    render(<GlobalTimerBar activeEntry={mockActiveEntry} predefinedTasks={mockTasks} onStart={vi.fn()} onStop={vi.fn()} onOpenNotes={onOpenNotes} onOpenTaskNote={vi.fn()} />);
    fireEvent.click(screen.getByText('Notes'));
    expect(onOpenNotes).toHaveBeenCalled();
  });

  it('calls onOpenTaskNote when Task Note button clicked', () => {
    const onOpenTaskNote = vi.fn();
    render(<GlobalTimerBar activeEntry={mockActiveEntry} predefinedTasks={mockTasks} onStart={vi.fn()} onStop={vi.fn()} onOpenNotes={vi.fn()} onOpenTaskNote={onOpenTaskNote} />);
    fireEvent.click(screen.getByText('Task Note'));
    expect(onOpenTaskNote).toHaveBeenCalled();
  });
});
