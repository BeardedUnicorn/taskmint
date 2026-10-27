import { useState, type FormEvent } from 'react';
import { Alert, Button, Stack, TextField } from '@mui/material';
import { AuthLayout } from './AuthLayout';
import { problem, type Server } from '../server';

/** Signing in; then on to `next`. */
export function LoginPage({ server, onSignedIn }: { server: Server; onSignedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await server.request('POST', '/auth/login', { username, password });
      onSignedIn();
    } catch (failure) {
      setError(problem(failure));
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Sign in to TaskMint">
      <form onSubmit={submit} noValidate>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Username"
            autoComplete="username"
            value={username}
            onChange={event => setUsername(event.target.value)}
            autoFocus
            required
            fullWidth
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            required
            fullWidth
          />
          <Button type="submit" variant="contained" size="large" disabled={busy || !username || !password}>
            Sign in
          </Button>
        </Stack>
      </form>
    </AuthLayout>
  );
}
