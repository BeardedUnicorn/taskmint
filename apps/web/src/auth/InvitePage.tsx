import { useState, type FormEvent } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { LinkPage } from './LinkPage';
import { PasswordFields, passwordProblem } from './PasswordFields';
import { problem, type Server } from '../server';
import type { InviteInfo } from '../types';

/** Accepting an invite: a new account, signed in straight away. */
export function InvitePage({ server, token, onSignedIn }: { server: Server; token: string; onSignedIn: () => void }) {
  const path = `/invites/${encodeURIComponent(token)}`;
  return (
    <LinkPage title="Join TaskMint" lookUp={() => server.request<InviteInfo>('GET', path)}>
      {invite => <InviteForm server={server} path={path} invite={invite} onSignedIn={onSignedIn} />}
    </LinkPage>
  );
}

function InviteForm({
  server,
  path,
  invite,
  onSignedIn,
}: {
  server: Server;
  path: string;
  invite: InviteInfo;
  onSignedIn: () => void;
}) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
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
      await server.request('POST', `${path}/accept`, { username, password, displayName });
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
          {invite.role === 'admin' ? "You're invited as an admin." : "You're invited to track your time here."} The link
          works until {new Date(invite.expiresAt).toLocaleString()}.
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Username"
          autoComplete="username"
          value={username}
          onChange={event => setUsername(event.target.value)}
          helperText="Letters, digits, '.', '_' or '-'"
          autoFocus
          required
          fullWidth
        />
        <TextField
          label="Your name"
          autoComplete="name"
          value={displayName}
          onChange={event => setDisplayName(event.target.value)}
          helperText="Optional: how TaskMint greets you"
          fullWidth
        />
        <PasswordFields
          label="Password"
          password={password}
          confirmation={confirmation}
          onPassword={setPassword}
          onConfirmation={setConfirmation}
        />
        <Button type="submit" variant="contained" size="large" disabled={busy || !username}>
          Create account
        </Button>
      </Stack>
    </form>
  );
}
