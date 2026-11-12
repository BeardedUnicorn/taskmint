/**
 * Signing out of cloud sync, after asking: from Settings → Cloud sync and
 * from the command palette. The device keeps its data and stops syncing.
 */

import { ConfirmDialog } from '../ui/dialogs/ConfirmDialog';
import { useNotification } from '../../contexts/NotificationContext';
import { cloudErrorMessage, type SyncEngine } from '../../cloud';

export function SignOutDialog({ open, onClose, engine }: { open: boolean; onClose: () => void; engine: SyncEngine }) {
  const { showSuccess, showError } = useNotification();
  const signOut = async () => {
    try {
      await engine.stopSyncing();
    } catch (error) {
      showError(`Couldn't sign out: ${cloudErrorMessage(error)}`, { category: 'settings', desktop: 'never' });
      throw error;
    }
    showSuccess('Signed out of cloud sync. Your data is still on this device.', {
      category: 'settings',
      desktop: 'never',
    });
  };
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={signOut}
      title="Sign out of cloud sync?"
      message="This device keeps its data and stops syncing until you sign in again. Your other devices and the cloud keep theirs."
      confirmLabel="Sign out"
    />
  );
}
