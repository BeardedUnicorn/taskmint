/**
 * The keyboard shortcuts, the desktop's menu bar, and the command palette
 * they open. Its own component, so the palette's view of tasks and timers
 * re-renders it alone, not the app around it.
 */

import { useCallback, useState } from 'react';
import { EVENTS, type MenuCommand } from '@taskmint/contracts';
import { CommandPalette } from './CommandPalette';
import { useCommands } from './commands';
import { otherModalOpen, useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useLiveTimerToggle } from '../../hooks/useLiveTimerToggle';
import { SignOutDialog } from '../cloud/SignOutDialog';
import { getCloudSync } from '../../cloud';
import { useAbout } from '../about/About';
import { useAppExtensions } from '../../app/extensions';
import { useNavigation } from '../../contexts/NavigationContext';
import { useBackendEvent } from '../../backend';

export function CommandCenter({ onStartWork, onAddTime }: { onStartWork: () => void; onAddTime: () => void }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen(previous => !previous), []);
  const close = useCallback(() => setOpen(false), []);
  const [signingOut, setSigningOut] = useState(false);
  const askToSignOut = useCallback(() => setSigningOut(true), []);
  const { navigate } = useNavigation();
  const pauseResume = useLiveTimerToggle();

  const { openAbout } = useAbout();
  const { AboutUpdates } = useAppExtensions();
  const showAbout = useCallback(() => openAbout(), [openAbout]);
  const checkForUpdates = useCallback(() => openAbout({ checkForUpdates: true }), [openAbout]);

  useKeyboardShortcuts({ paletteOpen: open, onTogglePalette: toggle, onStartWork, onPauseResume: pauseResume });

  // The menu bar's items. About and Check for Updates open over anything;
  // the rest wait while a dialog or the palette is open, as the shortcuts
  // do (the menu acts on a shortcut the app passed up for that reason).
  useBackendEvent<MenuCommand>(EVENTS.MENU_COMMAND, command => {
    if (command.type === 'about') return showAbout();
    if (command.type === 'checkForUpdates') return checkForUpdates();
    if (open || otherModalOpen()) return;
    switch (command.type) {
      case 'showView':
        return navigate(command.view);
      case 'newTask':
        return navigate('tasks', { intent: 'new-task' });
      case 'startWork':
        return onStartWork();
      case 'addTime':
        return onAddTime();
      case 'importWorkLogs':
        return navigate('payouts', { intent: 'import-work-logs' });
      case 'commandPalette':
        return toggle();
      case 'settings':
        return navigate('settings');
      case 'cloudSync':
        return navigate('settings', { section: 'sync' });
      case 'whatsNew':
        return navigate('settings', { section: 'about' });
      case 'keyboardShortcuts':
        return navigate('settings', { section: 'appearance' });
    }
  });

  const commands = useCommands({
    onStartWork,
    onAddTime,
    onSignOut: askToSignOut,
    onAbout: showAbout,
    onCheckForUpdates: AboutUpdates ? checkForUpdates : undefined,
  });
  // (The palette offers signing out only where sync runs)
  const sync = getCloudSync();

  return (
    <>
      <CommandPalette open={open} onClose={close} commands={commands} />
      {signingOut && <SignOutDialog open onClose={() => setSigningOut(false)} engine={sync!} />}
    </>
  );
}
