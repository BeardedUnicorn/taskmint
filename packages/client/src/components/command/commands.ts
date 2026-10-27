/**
 * What the command palette can do: open a page or a settings section, the
 * app's main actions, and timer actions (start a task; pause, resume or stop
 * the live timer). Built from the app's state each time the palette opens.
 */

import { useMemo } from 'react';
import { useNavigation } from '../../contexts/NavigationContext';
import { useTaskManagementContext } from '../../contexts/TaskManagementContext';
import { useSessionManagementContext } from '../../contexts/SessionManagementContext';
import { useTheme as useAppTheme } from '../../contexts/ThemeContext';
import { SETTINGS_SECTION_LABELS, VIEWS, VIEW_LABELS, availableSettingsSections } from '../../navigation/views';
import { TimerState } from '../../types/timer';
import { orderTasksForStart } from '../../utils/taskOrdering';
import { browserTakesShortcuts, modifierLabel, viewShortcut } from '../../hooks/useKeyboardShortcuts';
import { getBackend } from '../../backend';

export type CommandGroup = 'Timer' | 'Actions' | 'Pages' | 'Settings' | 'Start';

export interface Command {
  id: string;
  label: string;
  group: CommandGroup;
  /** Its keyboard shortcut, shown beside it. */
  hint?: string;
  /** Other words it answers to. */
  keywords?: string;
  run: () => void;
}

/** Lowercase, without the quotes around task names. */
const normalize = (text: string) => text.toLowerCase().replace(/["“”]/g, '').replace(/\s+/g, ' ');
const words = (text: string) => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * The commands matching `query`, best first: the label starts with it; then
 * each word of it starts a word of the command; then each appears anywhere
 * (label or keywords). Ties keep their order.
 */
export function rankCommands(commands: Command[], query: string): Command[] {
  const q = normalize(query).trim();
  if (!q) return commands;
  const queryWords = words(q);
  const scored: Array<{ command: Command; score: number }> = [];
  for (const command of commands) {
    const label = normalize(command.label);
    const extra = normalize(command.keywords ?? '');
    const commandWords = [...words(label), ...words(extra)];
    const score = label.startsWith(q)
      ? 0
      : queryWords.every(word => commandWords.some(candidate => candidate.startsWith(word)))
        ? 1
        : queryWords.every(word => label.includes(word) || extra.includes(word))
          ? 2
          : -1;
    if (score >= 0) scored.push({ command, score });
  }
  return scored.sort((a, b) => a.score - b.score).map(entry => entry.command);
}

export function useCommands({ onStartWork, onAddTime }: { onStartWork: () => void; onAddTime: () => void }): Command[] {
  const { navigate } = useNavigation();
  const { tasks } = useTaskManagementContext();
  const { sessions, activeSession, startTask, pauseTimerInstance, resumeTimerInstance, stopTimerInstance } =
    useSessionManagementContext();
  const { isDark, toggleTheme } = useAppTheme();

  return useMemo(() => {
    const mod = modifierLabel();
    const inBrowser = browserTakesShortcuts();
    const live = activeSession?.timerInstances.find(
      instance => instance.state === TimerState.running || instance.state === TimerState.paused
    );
    const liveTask = live && activeSession ? activeSession.taskName : null;
    const runningTaskId = live?.state === TimerState.running ? activeSession?.taskId : undefined;

    const timer: Command[] =
      live && liveTask
        ? [
            live.state === TimerState.running
              ? { id: 'timer-pause', label: `Pause "${liveTask}"`, group: 'Timer', run: () => void pauseTimerInstance(live.id) }
              : { id: 'timer-resume', label: `Resume "${liveTask}"`, group: 'Timer', run: () => void resumeTimerInstance(live.id) },
            { id: 'timer-stop', label: `Stop "${liveTask}"`, group: 'Timer', run: () => void stopTimerInstance(live.id) },
          ]
        : [];

    const actions: Command[] = [
      { id: 'start-work', label: 'Start work…', group: 'Actions', keywords: 'timer task begin', run: onStartWork },
      { id: 'add-time', label: 'Add time', group: 'Actions', keywords: 'manual entry hours', run: onAddTime },
      {
        id: 'new-task',
        label: 'New task',
        group: 'Actions',
        hint: inBrowser ? undefined : `${mod}N`,
        keywords: 'create add',
        run: () => navigate('tasks', { intent: 'new-task' }),
      },
      {
        id: 'toggle-theme',
        label: `Switch to ${isDark ? 'light' : 'dark'} theme`,
        group: 'Actions',
        keywords: 'appearance mode dark light',
        run: toggleTheme,
      },
    ];

    const pages: Command[] = VIEWS.map(view => ({
      id: `view-${view}`,
      label: `Go to ${VIEW_LABELS[view]}`,
      group: 'Pages',
      hint: viewShortcut(view),
      keywords: VIEW_LABELS[view],
      run: () => navigate(view),
    }));

    const settings: Command[] = availableSettingsSections(getBackend().platform).map(section => ({
      id: `settings-${section}`,
      label: `Settings: ${SETTINGS_SECTION_LABELS[section]}`,
      group: 'Settings',
      hint: section === 'appearance' && !inBrowser ? `${mod},` : undefined,
      run: () => navigate('settings', { section }),
    }));

    // Most-used first, the way the start picker lists them
    const start: Command[] = orderTasksForStart(tasks, sessions)
      .filter(task => task.id !== runningTaskId)
      .map(task => ({
        id: `start-${task.id}`,
        label: `Start "${task.name}"`,
        group: 'Start',
        keywords: 'timer begin',
        run: () => void startTask(task.id, task.name),
      }));

    return [...timer, ...actions, ...pages, ...settings, ...start];
  }, [
    activeSession,
    tasks,
    sessions,
    isDark,
    navigate,
    onStartWork,
    onAddTime,
    toggleTheme,
    startTask,
    pauseTimerInstance,
    resumeTimerInstance,
    stopTimerInstance,
  ]);
}
