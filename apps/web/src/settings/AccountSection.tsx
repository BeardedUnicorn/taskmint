/**
 * Settings → Account (the web app): who's signed in, signing out, a new
 * password by email, and deleting the account with all its data. The web
 * app's data is the cloud's own, so this stands in for Cloud sync.
 */

import { useState } from 'react';
import { Alert, Button, Stack, Typography } from '@mui/material';
import { AccountCircle as AccountIcon } from '@mui/icons-material';
import { ConfirmDialog, SettingsSection } from '@taskmint/client/ui';
import { cloudErrorMessage, useCloudSync } from '@taskmint/client/cloud';

export function AccountSection() {
  // The web app runs signed in, with sync
  const { engine, view } = useCloudSync()!;
  const email = view.user?.email ?? '';
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const attempt = async (action: () => Promise<void>) => {
    setProblem(null);
    try {
      await action();
    } catch (error) {
      setProblem(cloudErrorMessage(error));
      throw error;
    }
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
        <Button variant="outlined" onClick={() => void engine.signOut()}>
          Sign out
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
        message="Your account and all your TaskMint data in the cloud are deleted, and your other devices stop syncing (each keeps its own copy). This can't be undone."
        confirmLabel="Delete account"
        severity="error"
      />
    </SettingsSection>
  );
}
