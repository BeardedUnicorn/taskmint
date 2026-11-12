/**
 * The keyboard shortcuts and the command palette they open. Its own
 * component, so the palette's view of tasks and timers re-renders it alone,
 * not the app around it.
 */

import { useCallback, useState } from 'react';
import { CommandPalette } from './CommandPalette';
import { useCommands } from './commands';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { SignOutDialog } from '../cloud/SignOutDialog';
import { getCloudSync } from '../../cloud';

export function CommandCenter({ onStartWork, onAddTime }: { onStartWork: () => void; onAddTime: () => void }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen(previous => !previous), []);
  const close = useCallback(() => setOpen(false), []);
  const [signingOut, setSigningOut] = useState(false);
  const askToSignOut = useCallback(() => setSigningOut(true), []);

  useKeyboardShortcuts({ paletteOpen: open, onTogglePalette: toggle });
  const commands = useCommands({ onStartWork, onAddTime, onSignOut: askToSignOut });
  // (The palette offers signing out only where sync runs)
  const sync = getCloudSync();

  return (
    <>
      <CommandPalette open={open} onClose={close} commands={commands} />
      {signingOut && <SignOutDialog open onClose={() => setSigningOut(false)} engine={sync!} />}
    </>
  );
}
