import { useState, type FormEvent } from 'react';
import { Alert, Button, Stack, Typography } from '@mui/material';
import { LinkPage } from './LinkPage';
import { PasswordFields, passwordProblem } from './PasswordFields';
import { problem, type Server } from '../server';
import type { PasswordResetInfo } from '../types';

/** A password-reset link: a new password, which signs out everywhere else. */
export function ResetPage({ server, token, onSignedIn }: { server: Server; token: string; onSignedIn: () => void }) {
  const path = `/password-resets/${encodeURIComponent(token)}`;
  return (
    <LinkPage title="Set a new password" lookUp={() => server.request<PasswordResetInfo>('GET', path)}>
      {reset => <ResetForm server={server} path={path} reset={reset} onSignedIn={onSignedIn} />}
    </LinkPage>
  );
}

function ResetForm({
  server,
  path,
  reset,
  onSignedIn,
}: {
  server: Server;
  path: string;
  reset: PasswordResetInfo;
  onSignedIn: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = passwordProblem(password, confirmation);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await server.request('POST', `${path}/accept`, { password });
      onSignedIn();
    } catch (failure) {
      setError(problem(failure));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          For <strong>{reset.username}</strong>. Every other device signed in as {reset.username} is signed out.
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <PasswordFields
          password={password}
          confirmation={confirmation}
          onPassword={setPassword}
          onConfirmation={setConfirmation}
        />
        <Button type="submit" variant="contained" size="large" disabled={busy}>
          Set password
        </Button>
      </Stack>
    </form>
  );
}
