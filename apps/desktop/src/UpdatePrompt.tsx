import { useEffect, useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  LinearProgress,
  Typography,
} from '@mui/material';
import { ReleaseNotes, parseReleaseSection } from '@taskmint/client/ui';
import {
  automaticCheckDue,
  downloadsUpdates,
  updates,
  useUpdates,
  type AvailableUpdate,
  type DownloadProgress,
} from './updates';

/** The launch check waits this long, so it doesn't compete with startup. */
export const FIRST_CHECK_DELAY_MS = 10_000;
/**
 * How often to see whether the daily check is due. A timer in a window
 * hidden to the tray can be held back, so the daily check isn't one long
 * timer: this one, and the window showing again, catch up on it.
 */
export const DUE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Checks at launch and then daily, unless they're off or this is a development build. */
function useAutomaticChecks(): void {
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const check = () => void updates.check({ manual: false });
    const checkIfOn = () => updates.get().autoCheck && check();
    const checkIfDue = () => automaticCheckDue(Date.now()) && check();
    const onVisible = () => document.visibilityState === 'visible' && checkIfDue();

    const first = window.setTimeout(checkIfOn, FIRST_CHECK_DELAY_MS);
    const hourly = window.setInterval(checkIfDue, DUE_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(hourly);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

function Progress({ progress }: { progress: DownloadProgress | null }) {
  if (progress?.installing) {
    return (
      <>
        <LinearProgress aria-label="Installing the update" />
        <Typography variant="body2" sx={{ mt: 1 }}>
          Installing… TaskMint restarts when it's done.
        </Typography>
      </>
    );
  }
  const total = progress?.total ?? null;
  const percent = progress && total ? Math.min(100, Math.round((progress.downloaded / total) * 100)) : null;
  return (
    <>
      <LinearProgress
        aria-label="Downloading the update"
        variant={percent === null ? 'indeterminate' : 'determinate'}
        value={percent ?? undefined}
      />
      <Typography variant="body2" sx={{ mt: 1 }}>
        {progress === null
          ? 'Starting the download…'
          : `Downloading… ${megabytes(progress.downloaded)}${total ? ` of ${megabytes(total)}` : ''}`}
      </Typography>
    </>
  );
}

function Notes({ update }: { update: AvailableUpdate }) {
  const release = useMemo(
    () => (update.notes ? parseReleaseSection(update.version, update.notes) : null),
    [update.version, update.notes]
  );
  if (!release) return null;
  return (
    <Box sx={{ mt: 2, maxHeight: 280, overflow: 'auto' }}>
      <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600, mb: 1 }}>
        What's new
      </Typography>
      <ReleaseNotes release={release} />
    </Box>
  );
}

/**
 * The update check (the client's Background extension): it runs on its own
 * at launch and daily, and asks before installing what it finds, or on a
 * phone, before downloading it.
 */
export function UpdatePrompt() {
  useAutomaticChecks();
  const { update: state } = useUpdates();

  const open =
    (state.status === 'available' && state.open) || state.status === 'installing' || state.status === 'installFailed';
  if (!open) return null;

  const { update } = state;
  const installing = state.status === 'installing';
  const phone = downloadsUpdates();
  return (
    <Dialog
      open
      // Nothing closes it mid-install; otherwise closing is Later
      onClose={() => !installing && updates.later()}
      maxWidth="sm"
      fullWidth
      aria-labelledby="update-dialog-title"
    >
      <DialogTitle id="update-dialog-title">TaskMint {update.version} is available</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {phone
            ? `You have ${update.currentVersion}. Download opens the new version in your browser; open it once it's downloaded, and Android updates TaskMint with your data kept.`
            : `You have ${update.currentVersion}. TaskMint downloads the update, installs it and restarts. Running timers keep counting.`}
        </DialogContentText>
        <Notes update={update} />
        {installing && (
          <Box sx={{ mt: 3 }}>
            <Progress progress={state.progress} />
          </Box>
        )}
        {state.status === 'installFailed' && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {phone ? "The download couldn't be opened." : "The update couldn't be installed."} {state.error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={updates.later} disabled={installing}>
          {state.status === 'installFailed' ? 'Close' : 'Later'}
        </Button>
        <Button
          variant="contained"
          onClick={() => void (phone ? updates.download() : updates.install())}
          disabled={installing}
        >
          {state.status === 'installFailed' ? 'Try again' : phone ? 'Download' : 'Download and install'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
