import { useState, type FormEvent } from 'react';
import { Alert, Box, Button, Chip, Divider, Stack, TextField, Typography } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import { SettingsSection, useNotification } from '@taskmint/client/ui';
import { PasswordFields, passwordProblem } from '../auth/PasswordFields';
import { problem } from '../server';
import type { WebSession } from '../session';

/** Who's signed in, a new password, and signing out. */
export function AccountSection({ session }: { session: WebSession }) {
  const { user, server, navigate } = session;
  const { showSuccess, showError } = useNotification();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = passwordProblem(password, confirmation);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await server.request('POST', '/auth/password', { currentPassword: current, newPassword: password });
      setCurrent('');
      setPassword('');
      setConfirmation('');
      showSuccess('Password changed. Every other device was signed out.');
    } catch (failure) {
      setError(problem(failure));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    try {
      await server.request('POST', '/auth/logout');
    } catch (failure) {
      showError(problem(failure));
      return;
    }
    navigate('/login');
  };

  return (
    <SettingsSection
      title="Account"
      icon={<PersonIcon color="primary" />}
      headerChildren={user.role === 'admin' && <Chip label="Admin" size="small" color="primary" />}
    >
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography>
          Signed in as <strong>{user.displayName || user.username}</strong>
          {user.displayName && ` (${user.username})`}
        </Typography>
        <Button variant="outlined" onClick={signOut}>
          Sign out
        </Button>
      </Stack>
      <Divider sx={{ mb: 3 }} />
      <Box component="form" onSubmit={changePassword} noValidate sx={{ maxWidth: 420 }}>
        <Stack spacing={2}>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
            Change password
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={event => setCurrent(event.target.value)}
            required
            fullWidth
          />
          <PasswordFields
            password={password}
            confirmation={confirmation}
            onPassword={setPassword}
            onConfirmation={setConfirmation}
          />
          <Box>
            <Button type="submit" variant="contained" disabled={busy || !current}>
              Change password
            </Button>
          </Box>
        </Stack>
      </Box>
    </SettingsSection>
  );
}
