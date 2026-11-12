import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { asBackend, bea, createFakeCloudStore, installFakeBackendForTest } from '../../../testing';
import '@testing-library/jest-dom/vitest';
import { act, render, renderHook, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { render as renderWithNotifications } from '../../../__tests__/setup/test-helpers';
import { SyncEngine, setCloudSyncForTest } from '../../../cloud';
import { syncHost } from '../../../cloud/__tests__/syncHost';
import { ReactNode } from 'react';
import { CommandPalette } from '../CommandPalette';
import { CommandCenter } from '../CommandCenter';
import { Command, rankCommands, useCommands } from '../commands';
import { NavigationProvider, useNavigation } from '../../../contexts/NavigationContext';
import { isMacPlatform } from '../../../hooks/useKeyboardShortcuts';
import { TaskSession, TimerState } from '../../../types/timer';
import {
  createMockTask,
  createMockTaskSession,
  createMockTimerInstance,
} from '../../../__tests__/setup/session-test-utils';

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
  const commands = [
    command('Go to Tasks', { group: 'Pages', hint: '⌘2' }),
    command('Go to History', { group: 'Pages' }),
    command('Add time'),
  ];

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

  it('does nothing on Enter or the arrows while nothing matches, nor on other keys', () => {
    const onClose = vi.fn();
    render(<CommandPalette open onClose={onClose} commands={commands} />);
    const input = screen.getByRole('combobox', { name: 'Command' });

    fireEvent.keyDown(input, { key: 'a' });
    fireEvent.change(input, { target: { value: 'qqq' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();

    // Matching again starts from the top
    fireEvent.change(input, { target: { value: 'go' } });
    expect(screen.getByRole('option', { name: /Go to Tasks/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('highlights what the pointer is over', () => {
    render(<CommandPalette open onClose={vi.fn()} commands={commands} />);
    fireEvent.mouseMove(screen.getByRole('option', { name: 'Add time' }));
    expect(screen.getByRole('option', { name: 'Add time' })).toHaveAttribute('aria-selected', 'true');
  });

  it('moves the highlight with the arrow keys, wrapping around', () => {
    render(<CommandPalette open onClose={vi.fn()} commands={commands} />);
    const input = screen.getByRole('combobox', { name: 'Command' });
    const selected = () =>
      screen.getAllByRole('option').find(option => option.getAttribute('aria-selected') === 'true');

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
const theme = vi.hoisted(() => ({ isDark: true, toggleTheme: vi.fn() }));
vi.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => theme }));

describe('useCommands', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <NavigationProvider>{children}</NavigationProvider>;
  const labels = (commands: Command[]) => commands.map(c => c.label);

  beforeEach(() => {
    taskList.value = [
      createMockTask({ id: 'a', name: 'Annotation' }),
      createMockTask({ id: 'r', name: 'Review', isFavorite: true }),
      createMockTask({ id: 'x', name: 'Old', isArchived: true }),
    ];
    session.value.sessions = [];
    session.value.activeSession = null;
    theme.isDark = true;
  });

  it('offers pages, settings sections, actions, and a start for each active task, favorites first', () => {
    const { result } = renderHook(() => useCommands({ onStartWork: vi.fn(), onAddTime: vi.fn(), onSignOut: vi.fn() }), {
      wrapper,
    });
    const all = labels(result.current);

    expect(all).toEqual(
      expect.arrayContaining([
        'Go to Sessions',
        'Go to Settings',
        'Settings: Notifications',
        'New task',
        'Add time',
        'Switch to light theme',
      ])
    );
    expect(all.filter(label => label.startsWith('Start "'))).toEqual(['Start "Review"', 'Start "Annotation"']);
  });

  it('in a browser, offers the settings it has and no shortcuts the browser keeps', () => {
    installFakeBackendForTest({ capabilities: { runtime: 'web' }, without: ['idle', 'folderBackups'] });
    const { result } = renderHook(() => useCommands({ onStartWork: vi.fn(), onAddTime: vi.fn(), onSignOut: vi.fn() }), {
      wrapper,
    });
    const byId = (id: string) => result.current.find(command => command.id === id);

    expect(byId('settings-idle')).toBeUndefined();
    expect(byId('settings-backups')).toBeUndefined();
    expect(byId('settings-appearance')?.hint).toBeUndefined();
    expect(byId('new-task')?.hint).toBeUndefined();
    expect(byId('view-sessions')?.hint).toBeDefined();
  });

  it('opens pages, settings sections and a new task, and offers the dark theme in the light one', () => {
    theme.isDark = false;
    const { result } = renderHook(
      () => ({
        commands: useCommands({ onStartWork: vi.fn(), onAddTime: vi.fn(), onSignOut: vi.fn() }),
        navigation: useNavigation(),
      }),
      { wrapper }
    );
    const run = (id: string) => act(() => result.current.commands.find(command => command.id === id)!.run());

    expect(labels(result.current.commands)).toContain('Switch to dark theme');
    run('view-history');
    expect(result.current.navigation.view).toBe('history');
    run('settings-backups');
    expect(result.current.navigation).toMatchObject({ view: 'settings', params: { section: 'backups' } });
    run('new-task');
    expect(result.current.navigation).toMatchObject({ view: 'tasks', params: { intent: 'new-task' } });
  });

  it('starts a task the same way the start picker does', () => {
    const { result } = renderHook(() => useCommands({ onStartWork: vi.fn(), onAddTime: vi.fn(), onSignOut: vi.fn() }), {
      wrapper,
    });
    result.current.find(c => c.label === 'Start "Annotation"')!.run();
    expect(session.value.startTask).toHaveBeenCalledWith('a', 'Annotation');
  });

  it('pauses or stops the running timer, and leaves its task out of the starts', () => {
    const running = createMockTimerInstance({ id: 'run', state: TimerState.running });
    session.value.activeSession = createMockTaskSession({
      taskId: 'r',
      taskName: 'Review',
      isActive: true,
      timerInstances: [running],
    });

    const { result } = renderHook(() => useCommands({ onStartWork: vi.fn(), onAddTime: vi.fn(), onSignOut: vi.fn() }), {
      wrapper,
    });
    const all = labels(result.current);
    expect(all.slice(0, 2)).toEqual(['Pause "Review"', 'Stop "Review"']);
    expect(all).not.toContain('Start "Review"');

    result.current[0].run();
    expect(session.value.pauseTimerInstance).toHaveBeenCalledWith('run');
    result.current[1].run();
    expect(session.value.stopTimerInstance).toHaveBeenCalledWith('run');
  });

  it('acts on the running timer of a session on several tasks, and names its own task', () => {
    const review = { taskId: 'b', taskName: 'Writing', hourlyRate: null };
    const paused = createMockTimerInstance({ id: 'p', state: TimerState.paused, pausedAt: '2024-01-15T10:30:00Z' });
    const running = createMockTimerInstance({ id: 'run', state: TimerState.running, task: review });
    session.value.activeSession = createMockTaskSession({
      taskId: 'r',
      taskName: 'Review',
      isActive: true,
      timerInstances: [paused, running],
    });

    const { result } = renderHook(() => useCommands({ onStartWork: vi.fn(), onAddTime: vi.fn(), onSignOut: vi.fn() }), {
      wrapper,
    });
    const all = labels(result.current);

    expect(all.slice(0, 2)).toEqual(['Pause "Writing"', 'Stop "Writing"']);
    // The paused timer's task can be started (it resumes); the running one's can't
    expect(all).toContain('Start "Review"');
  });

  it('offers to resume the timer paused last', () => {
    const paused = (id: string, pausedAt: string) =>
      createMockTimerInstance({ id, state: TimerState.paused, pausedAt });
    session.value.activeSession = createMockTaskSession({
      taskId: 'r',
      taskName: 'Review',
      isActive: true,
      timerInstances: [paused('earlier', '2024-01-15T10:00:00Z'), paused('latest', '2024-01-15T10:30:00Z')],
    });

    const { result } = renderHook(() => useCommands({ onStartWork: vi.fn(), onAddTime: vi.fn(), onSignOut: vi.fn() }), {
      wrapper,
    });
    result.current[0].run();

    expect(session.value.resumeTimerInstance).toHaveBeenCalledWith('latest');
  });

  it('resumes a paused timer', () => {
    const paused = createMockTimerInstance({ id: 'p', state: TimerState.paused });
    session.value.activeSession = createMockTaskSession({
      taskId: 'r',
      taskName: 'Review',
      isActive: true,
      timerInstances: [paused],
    });

    const { result } = renderHook(() => useCommands({ onStartWork: vi.fn(), onAddTime: vi.fn(), onSignOut: vi.fn() }), {
      wrapper,
    });
    expect(result.current[0].label).toBe('Resume "Review"');
    result.current[0].run();
    expect(session.value.resumeTimerInstance).toHaveBeenCalledWith('p');
  });
});

describe('CommandCenter', () => {
  const modifier = () => (isMacPlatform() ? { metaKey: true } : { ctrlKey: true });

  it('opens the palette on the shortcut, and closes it on the shortcut or Escape', async () => {
    render(
      <NavigationProvider>
        <CommandCenter onStartWork={vi.fn()} onAddTime={vi.fn()} />
      </NavigationProvider>
    );
    const palette = () => screen.queryByRole('dialog', { name: 'Command palette' });

    fireEvent.keyDown(window, { key: 'k', ...modifier() });
    expect(palette()).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'k', ...modifier() });
    await waitFor(() => expect(palette()).not.toBeInTheDocument());

    fireEvent.keyDown(window, { key: 'k', ...modifier() });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Command' }), { key: 'Escape' });
    await waitFor(() => expect(palette()).not.toBeInTheDocument());
  });
});

describe('signing out from the palette', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <NavigationProvider>{children}</NavigationProvider>;
  const OPTIONS = { sendDelayMs: 1, retryMs: 10_000, publishDelayMs: 1, publishRetryMs: 10_000 };
  afterEach(() => setCloudSyncForTest(null));

  async function signedIn() {
    const store = createFakeCloudStore();
    store.setEpoch('bea', 1);
    const host = syncHost({ account: { uid: 'bea', epoch: 1 } });
    const engine = new SyncEngine(asBackend(host.backend), async () => store, OPTIONS);
    setCloudSyncForTest(engine);
    await engine.start();
    store.setUser(bea());
    await vi.waitFor(() => expect(engine.getView().phase).toBe('synced'));
    return host;
  }

  it('is offered only while signed in where this device syncs', async () => {
    const commands = () =>
      renderHook(() => useCommands({ onStartWork: vi.fn(), onAddTime: vi.fn(), onSignOut: vi.fn() }), { wrapper })
        .result.current;
    expect(commands().some(c => c.id === 'sign-out')).toBe(false);
    await signedIn();
    expect(commands().find(c => c.id === 'sign-out')?.label).toBe('Sign out of cloud sync');
  });

  it('asks first, then signs out', async () => {
    const host = await signedIn();
    renderWithNotifications(
      <NavigationProvider>
        <CommandCenter onStartWork={vi.fn()} onAddTime={vi.fn()} />
      </NavigationProvider>
    );
    fireEvent.keyDown(window, { key: 'k', ...(isMacPlatform() ? { metaKey: true } : { ctrlKey: true }) });
    fireEvent.change(screen.getByRole('combobox', { name: 'Command' }), { target: { value: 'log out' } });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Command' }), { key: 'Enter' });

    const dialog = await screen.findByRole('dialog', { name: 'Sign out of cloud sync?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(host.state.account).toBeNull());
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Sign out of cloud sync?' })).not.toBeInTheDocument()
    );
  });
});
