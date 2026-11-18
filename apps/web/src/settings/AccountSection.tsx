/**
 * Settings → Account (the web app): who's signed in, signing out, a new
 * password by email, and deleting the account with all its data. The web
 * app's data is the cloud's own, so this stands in for Cloud sync.
 *
 * Signing out reloads the page, and the page is the only other place the
 * data is: changes not yet sent (sync sends them a second after they're
 * made) go to the cloud first. If the cloud doesn't take them, signing out
 * asks before it loses them.
 */

import { useState } from 'react';
import { Alert, Button, Stack, Typography } from '@mui/material';
import { AccountCircle as AccountIcon } from '@mui/icons-material';
import { ConfirmDialog, SettingsSection } from '@taskmint/client/ui';
import { cloudErrorMessage, saveToCloud, useCloudSync } from '@taskmint/client/cloud';

/** How long signing out waits for the cloud to take the latest changes before asking (offline, a write just waits). */
export const SAVE_WAIT_MS = 10_000;

export function AccountSection() {
  // The web app runs signed in, with sync
  const { engine, view } = useCloudSync()!;
  const email = view.user?.email ?? '';
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Why the latest changes aren't in the account, while asking whether to sign out without them
  const [unsaved, setUnsaved] = useState<string | null>(null);

  const attempt = async (action: () => Promise<void>) => {
    setProblem(null);
    try {
      await action();
    } catch (error) {
      setProblem(cloudErrorMessage(error));
      throw error;
    }
  };

  const signOut = async () => {
    setProblem(null);
    setSaving(true);
    let waited: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        saveToCloud(engine),
        new Promise<never>((_, reject) => {
          waited = setTimeout(() => reject(new Error('The cloud isn’t answering.')), SAVE_WAIT_MS);
        }),
      ]);
    } catch (error) {
      setUnsaved(cloudErrorMessage(error));
      return;
    } finally {
      clearTimeout(waited);
      setSaving(false);
    }
    await attempt(() => engine.signOut()).catch(() => undefined);
  };

  return (
    <SettingsSection title="Account" icon={<AccountIcon color="primary" />}>
      <Typography variant="body1" sx={{ mb: 2 }}>
        Signed in as {email}
      </Typography>
      {notice && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}
      {problem && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {problem}
        </Alert>
      )}
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <Button variant="outlined" onClick={() => void signOut()} disabled={saving}>
          {saving ? 'Saving your changes…' : 'Sign out'}
        </Button>
        <Button
          onClick={() =>
            void attempt(async () => {
              await engine.resetPassword(email);
              setNotice(`A link to set a new password is on its way to ${email}.`);
            }).catch(() => undefined)
          }
        >
          Change password
        </Button>
        <Button color="error" onClick={() => setDeleting(true)}>
          Delete account
        </Button>
      </Stack>
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => attempt(() => engine.deleteAccount())}
        title="Delete your account?"
        message="Your account and all your TaskMint data in the cloud are deleted, and your other devices stop syncing (each keeps its own copy). BudgetMint keeps its own data but stops seeing your payouts. This can't be undone."
        confirmLabel="Delete account"
        severity="error"
      />
      <ConfirmDialog
        open={unsaved !== null}
        onClose={() => setUnsaved(null)}
        onConfirm={() => attempt(() => engine.signOut())}
        title="Sign out without your latest changes?"
        message={`Your latest changes haven’t reached your account, and signing out now loses them. ${unsaved}`}
        confirmLabel="Sign out anyway"
        cancelLabel="Stay signed in"
      />
    </SettingsSection>
  );
}
