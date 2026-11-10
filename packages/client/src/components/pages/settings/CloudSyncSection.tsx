/**
 * Settings → Cloud sync: sign in to sync this device's data with your other
 * devices and the web app, and see where it stands. The work is the sync
 * engine's (cloud/engine.ts); this shows its state and asks what only the
 * user can decide.
 */

import { FormEvent, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { CloudSync as CloudIcon, Google as GoogleIcon } from '@mui/icons-material';
import { SettingsSection } from './SettingsSection';
import { ConfirmDialog } from '../../ui/dialogs/ConfirmDialog';
import { useCloudSync, type SyncEngine, type SyncView } from '../../../cloud';
import { cloudErrorMessage } from '../../../cloud/errors';

type FormMode = 'signIn' | 'signUp' | 'reset';

const FORM_TITLES: Record<FormMode, string> = {
  signIn: 'Sign in',
  signUp: 'Create account',
  reset: 'Send reset link',
};

/** What signing in needs: the sync engine, or the web app's store before the app starts. */
export interface SignInActions {
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  readonly canUseGoogle: boolean;
}

const INTRO =
  "Sign in to keep this device's sessions, tasks and work logs in step with your other devices and the web app. Without it, everything stays on this device.";

/** Email and password: signing in, making an account, or a reset link. And Google, where the build can. */
export function SignInForm({ engine, intro = INTRO }: { engine: SignInActions; intro?: string }) {
  const [mode, setMode] = useState<FormMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const google = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await engine.signInWithGoogle();
    } catch (error) {
      setProblem(cloudErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (next: FormMode) => {
    setMode(next);
    setProblem(null);
    setNotice(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      if (mode === 'reset') {
        await engine.resetPassword(email.trim());
        setNotice(`If ${email.trim()} has an account, a reset link is on its way.`);
        setMode('signIn');
      } else {
        await (mode === 'signIn' ? engine.signIn : engine.signUp)(email.trim(), password);
      }
    } catch (error) {
      setProblem(cloudErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box component="form" onSubmit={submit} noValidate sx={{ maxWidth: 420 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {intro}
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
      <Stack spacing={2}>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          size="small"
        />
        {mode !== 'reset' && (
          <TextField
            label="Password"
            type="password"
            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
            value={password}
            onChange={event => setPassword(event.target.value)}
            size="small"
          />
        )}
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {FORM_TITLES[mode]}
          </Button>
          {mode === 'signIn' ? (
            <>
              <Button onClick={() => switchTo('signUp')}>Create an account</Button>
              <Button onClick={() => switchTo('reset')}>Forgot password?</Button>
            </>
          ) : (
            <Button onClick={() => switchTo('signIn')}>I have an account</Button>
          )}
        </Stack>
        {engine.canUseGoogle && mode !== 'reset' && (
          <Box>
            <Button variant="outlined" startIcon={<GoogleIcon />} disabled={busy} onClick={() => void google()}>
              Continue with Google
            </Button>
          </Box>
        )}
      </Stack>
    </Box>
  );
}

/** What the signed-in panel's chip says. */
function statusLabel(view: SyncView): string {
  if (view.phase === 'synced') return 'Up to date';
  return view.pending === 1 ? '1 change to send' : `${view.pending} changes to send`;
}

function Signedin({ engine, view }: { engine: SyncEngine; view: SyncView }) {
  const [confirming, setConfirming] = useState<'stop' | 'delete' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const attempt = (action: () => Promise<void>) => async () => {
    setProblem(null);
    try {
      await action();
    } catch (error) {
      setProblem(cloudErrorMessage(error));
      throw error;
    }
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
        <Typography variant="body1">Signed in as {view.user!.email}</Typography>
        {view.phase !== 'error' && (
          <Chip size="small" label={statusLabel(view)} color={view.phase === 'synced' ? 'success' : 'default'} />
        )}
      </Stack>
      {view.phase === 'error' && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={<Button onClick={() => void engine.retry()}>Try again</Button>}
        >
          {view.error}
        </Alert>
      )}
      {view.held > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Some of your data was saved by a newer version of TaskMint. Update this app to see it.
        </Alert>
      )}
      {problem && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {problem}
        </Alert>
      )}
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <Button variant="outlined" onClick={engine.syncNow}>
          Sync now
        </Button>
        <Button onClick={() => setConfirming('stop')}>Stop syncing</Button>
        <Button color="error" onClick={() => setConfirming('delete')}>
          Delete cloud data
        </Button>
      </Stack>
      <ConfirmDialog
        open={confirming === 'stop'}
        onClose={() => setConfirming(null)}
        onConfirm={attempt(() => engine.stopSyncing())}
        title="Stop syncing this device?"
        message="This device keeps its data and signs out. Your other devices and the cloud keep theirs. Sign in again to sync."
        confirmLabel="Stop syncing"
      />
      <ConfirmDialog
        open={confirming === 'delete'}
        onClose={() => setConfirming(null)}
        onConfirm={attempt(() => engine.deleteCloudData())}
        title="Delete your cloud data?"
        message="Your sessions, tasks and work logs are deleted from the cloud, and every device stops syncing. Each device keeps its own copy. This can't be undone."
        confirmLabel="Delete cloud data"
        severity="error"
      />
    </Box>
  );
}

/** Both sides have data: join them, or take the cloud's. */
function Choose({ engine }: { engine: SyncEngine }) {
  const [replacing, setReplacing] = useState(false);
  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        This device and your cloud account both have data. Merging keeps both; where the same item changed on both, this
        device's version wins.
      </Alert>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
        <Button variant="contained" onClick={() => void engine.choose('merge')}>
          Merge them
        </Button>
        <Button onClick={() => setReplacing(true)}>Use the cloud's data</Button>
        <Button onClick={() => void engine.signOut()}>Sign out</Button>
      </Stack>
      <ConfirmDialog
        open={replacing}
        onClose={() => setReplacing(false)}
        onConfirm={() => engine.choose('replace')}
        title="Replace this device's data?"
        message="This device's sessions, work logs, tasks and notes are replaced by the cloud's. A copy of them is kept in the app's data folder first."
        confirmLabel="Replace"
      />
    </Box>
  );
}

/** A notice with a way on. */
function Notice({
  severity,
  message,
  action,
  engine,
}: {
  severity: 'info' | 'warning';
  message: string;
  action?: { label: string; run: () => Promise<void> };
  engine: SyncEngine;
}) {
  return (
    <Box>
      <Alert severity={severity} sx={{ mb: 2 }}>
        {message}
      </Alert>
      <Stack direction="row" spacing={1}>
        {action && (
          <Button variant="contained" onClick={() => void action.run()}>
            {action.label}
          </Button>
        )}
        <Button onClick={() => void engine.signOut()}>Sign out</Button>
      </Stack>
    </Box>
  );
}

function Body({ engine, view }: { engine: SyncEngine; view: SyncView }) {
  switch (view.phase) {
    case 'loading':
    case 'connecting':
      return (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <CircularProgress size={16} />
          <Typography variant="body2">Connecting…</Typography>
        </Stack>
      );
    case 'signedOut':
      return <SignInForm engine={engine} />;
    case 'choose':
      return <Choose engine={engine} />;
    case 'otherAccount':
      return (
        <Notice
          severity="warning"
          engine={engine}
          message={`This device syncs with a different account. Sign in with that one, or sync this device with ${view.user!.email} from now on (its data joins that account's).`}
          action={{ label: `Sync with ${view.user!.email}`, run: engine.syncThisAccount.bind(engine) }}
        />
      );
    case 'cloudReset':
      return (
        <Notice
          severity="info"
          engine={engine}
          message="The cloud data was deleted, so this device stopped syncing. Its data is still here."
          action={{ label: 'Sync again', run: engine.syncThisAccount.bind(engine) }}
        />
      );
    case 'error':
      return view.user ? (
        <Signedin engine={engine} view={view} />
      ) : (
        <Alert severity="error">Cloud sync couldn't start: {view.error}</Alert>
      );
    default:
      return <Signedin engine={engine} view={view} />;
  }
}

export function CloudSyncSection() {
  // Settings lists the section only where the build syncs
  const { engine, view } = useCloudSync()!;
  return (
    <SettingsSection title="Cloud sync" icon={<CloudIcon color="primary" />}>
      <Body engine={engine} view={view} />
    </SettingsSection>
  );
}
