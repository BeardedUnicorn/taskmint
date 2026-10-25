import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, renderHook, screen, fireEvent } from '@testing-library/react';
import { ReactNode } from 'react';
import { CommandPalette } from '../CommandPalette';
import { Command, rankCommands, useCommands } from '../commands';
import { NavigationProvider } from '../../../contexts/NavigationContext';
import { TaskSession, TimerState } from '../../../types/timer';
import { createMockTask, createMockTaskSession, createMockTimerInstance } from '../../../__tests__/setup/session-test-utils';

const command = (label: string, overrides: Partial<Command> = {}): Command => ({
  id: label,
  label,
  group: 'Actions',
  run: vi.fn(),
  ...overrides,
});

describe('rankCommands', () => {
  const commands = [
    command('Go to Payouts'),
    command('Start "Code Review"'),
    command('Settings: Backups'),
    command('Add time', { keywords: 'manual entry' }),
    command('Go to Settings'),
  ];

  it('keeps everything, in order, with no query', () => {
    expect(rankCommands(commands, '  ')).toEqual(commands);
  });

  it('puts label prefixes first, then word starts, then anywhere', () => {
    expect(rankCommands(commands, 'set').map(c => c.label)).toEqual(['Settings: Backups', 'Go to Settings']);
    expect(rankCommands(commands, 'view').map(c => c.label)).toEqual(['Start "Code Review"']);
    expect(rankCommands(commands, 'go').map(c => c.label)).toEqual(['Go to Payouts', 'Go to Settings']);
  });

  it('matches several words, and task names without their quotes', () => {
    expect(rankCommands(commands, 'start co').map(c => c.label)).toEqual(['Start "Code Review"']);
    expect(rankCommands(commands, 'code rev').map(c => c.label)).toEqual(['Start "Code Review"']);
    expect(rankCommands(commands, 'go pay').map(c => c.label)).toEqual(['Go to Payouts']);
  });

  it('answers to its keywords', () => {
    expect(rankCommands(commands, 'manual').map(c => c.label)).toEqual(['Add time']);
  });

  it('drops what does not match', () => {
    expect(rankCommands(commands, 'zzz')).toEqual([]);
  });
});

describe('CommandPalette', () => {
  const commands = [command('Go to Tasks', { group: 'Pages', hint: '⌘2' }), command('Go to History', { group: 'Pages' }), command('Add time')];

  it('filters as you type and runs the highlighted command on Enter, closing first', () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} commands={commands} />);
    const input = screen.getByRole('combobox', { name: 'Command' });

    fireEvent.change(input, { target: { value: 'hist' } });
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['Go to History']);

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onClose).toHaveBeenCalled();
    expect(commands[1].run).toHaveBeenCalled();
  });

  it('moves the highlight with the arrow keys, wrapping around', () => {
    render(<CommandPalette open onClose={vi.fn()} commands={commands} />);
    const input = screen.getByRole('combobox', { name: 'Command' });
    const selected = () => screen.getAllByRole('option').find(option => option.getAttribute('aria-selected') === 'true');

    expect(selected()).toHaveTextContent('Go to Tasks');
    expect(input).toHaveAttribute('aria-activedescendant', selected()!.id);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(selected()).toHaveTextContent('Go to History');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(selected()).toHaveTextContent('Add time');
  });

  it('shows shortcuts beside commands, and says when nothing matches', () => {
    render(<CommandPalette open onClose={vi.fn()} commands={commands} />);
    expect(screen.getByText('⌘2')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Command' }), { target: { value: 'qqq' } });
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });

  it('runs a command on click', () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} commands={commands} />);
    fireEvent.click(screen.getByRole('option', { name: 'Add time' }));
    expect(commands[2].run).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

// --- The commands built from the app's state ---

const session = vi.hoisted(() => ({
  value: {
    sessions: [] as TaskSession[],
    activeSession: null as TaskSession | null,
    startTask: vi.fn(),
    pauseTimerInstance: vi.fn(),
    resumeTimerInstance: vi.fn(),
    stopTimerInstance: vi.fn(),
  },
}));
vi.mock('../../../contexts/SessionManagementContext', () => ({
  useSessionManagementContext: () => session.value,
}));
const taskList = vi.hoisted(() => ({ value: [] as ReturnType<typeof createMockTask>[] }));
vi.mock('../../../contexts/TaskManagementContext', () => ({
  useTaskManagementContext: () => ({ tasks: taskList.value }),
}));
const toggleTheme = vi.hoisted(() => vi.fn());
vi.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: true, toggleTheme }),
}));

describe('useCommands', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <NavigationProvider>{children}</NavigationProvider>;
  const labels = (commands: Command[]) => commands.map(c => c.label);

  beforeEach(() => {
    vi.clearAllMocks();
    taskList.value = [
      createMockTask({ id: 'a', name: 'Annotation' }),
      createMockTask({ id: 'r', name: 'Review', isFavorite: true }),
      createMockTask({ id: 'x', name: 'Old', isArchived: true }),
    ];
    session.value.sessions = [];
    session.value.activeSession = null;
  });

  it('offers pages, settings sections, actions, and a start for each active task, favorites first', () => {
    const { result } = renderHook(() => useCommands({ onStartWork: vi.fn(), onAddTime: vi.fn() }), { wrapper });
    const all = labels(result.current);

    expect(all).toEqual(expect.arrayContaining(['Go to Sessions', 'Go to Settings', 'Settings: Notifications', 'New task', 'Add time', 'Switch to light theme']));
    expect(all.filter(label => label.startsWith('Start "'))).toEqual(['Start "Review"', 'Start "Annotation"']);
  });

  it('starts a task the same way the start picker does', () => {
    const { result } = renderHook(() => useCommands({ onStartWork: vi.fn(), onAddTime: vi.fn() }), { wrapper });
    result.current.find(c => c.label === 'Start "Annotation"')!.run();
    expect(session.value.startTask).toHaveBeenCalledWith('a', 'Annotation');
  });

  it('pauses or stops the running timer, and leaves its task out of the starts', () => {
    const running = createMockTimerInstance({ id: 'run', state: TimerState.running });
    session.value.activeSession = createMockTaskSession({ taskId: 'r', taskName: 'Review', isActive: true, timerInstances: [running] });

    const { result } = renderHook(() => useCommands({ onStartWork: vi.fn(), onAddTime: vi.fn() }), { wrapper });
    const all = labels(result.current);
    expect(all.slice(0, 2)).toEqual(['Pause "Review"', 'Stop "Review"']);
    expect(all).not.toContain('Start "Review"');

    result.current[0].run();
    expect(session.value.pauseTimerInstance).toHaveBeenCalledWith('run');
    result.current[1].run();
    expect(session.value.stopTimerInstance).toHaveBeenCalledWith('run');
  });

  it('resumes a paused timer', () => {
    const paused = createMockTimerInstance({ id: 'p', state: TimerState.paused });
    session.value.activeSession = createMockTaskSession({ taskId: 'r', taskName: 'Review', isActive: true, timerInstances: [paused] });

    const { result } = renderHook(() => useCommands({ onStartWork: vi.fn(), onAddTime: vi.fn() }), { wrapper });
    expect(result.current[0].label).toBe('Resume "Review"');
    result.current[0].run();
    expect(session.value.resumeTimerInstance).toHaveBeenCalledWith('p');
  });
});
