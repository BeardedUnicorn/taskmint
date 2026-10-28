import { useEffect, useState, type FormEvent } from "react";
import { Alert, Box, Button, Chip, Stack, TextField, Typography, type ChipProps } from "@mui/material";
import CloudIcon from "@mui/icons-material/Cloud";
import { EVENTS } from "@taskmint/contracts";
import { getBackend } from "@taskmint/client/backend";
import { ConfirmDialog, SettingsSection, useNotification } from "@taskmint/client/ui";
import { sentence, serverMode, type Connection, type Link, type LinkStatus, type ServerConnection } from "../server";

const LINKS: Record<LinkStatus, { label: string; color: ChipProps["color"] }> = {
  connecting: { label: "Connecting…", color: "default" },
  connected: { label: "Connected", color: "success" },
  unreachable: { label: "Can't reach the server", color: "warning" },
  signedOut: { label: "Signed out", color: "error" },
};

/**
 * Where this computer's data lives: here, or on a TaskMint server it's
 * signed in to. Connecting and disconnecting restart the app.
 */
export function ServerSection() {
  // undefined until the Rust side says; null in local mode
  const [connection, setConnection] = useState<ServerConnection | null>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    serverMode.connection().then(setConnection, failure => setError(sentence(failure)));
    return getBackend().subscribe<Link>(EVENTS.SERVER_CONNECTION_CHANGED, link =>
      setConnection(current => (current ? { ...current, ...link } : current)),
    );
  }, []);

  return (
    <SettingsSection
      title="Server"
      icon={<CloudIcon color="primary" />}
      headerChildren={
        connection && (
          <Chip label={LINKS[connection.status].label} color={LINKS[connection.status].color} size="small" />
        )
      }
    >
      {error && <Alert severity="error">{error}</Alert>}
      {connection === null && <OnThisComputer />}
      {connection && <OnTheServer connection={connection} />}
    </SettingsSection>
  );
}

function OnThisComputer() {
  return (
    <Stack spacing={2}>
      <Typography>
        Your data is on this computer. Connect to a TaskMint server to keep it there instead, and use it from a browser
        and other computers too.
      </Typography>
      <SignInForm submitLabel="Connect" />
      <Typography variant="body2" color="text.secondary">
        TaskMint restarts to use the server. The data on this computer stays here, and disconnecting brings it back.
      </Typography>
    </Stack>
  );
}

/** Signs this computer in (to a new server, or again to its own), then restarts. */
function SignInForm({ connection, submitLabel }: { connection?: Connection; submitLabel: string }) {
  const [url, setUrl] = useState(connection?.url ?? "http://localhost:8080");
  const [username, setUsername] = useState(connection?.username ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await serverMode.connect(url, username, password);
      setRestarting(true);
      await serverMode.restart();
    } catch (failure) {
      setError(sentence(failure));
      setBusy(false);
    }
  };

  if (restarting) {
    return <Alert severity="success">Signed in. TaskMint is restarting to use the server…</Alert>;
  }
  return (
    <Box component="form" onSubmit={signIn} noValidate sx={{ maxWidth: 420 }}>
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          label="Server address"
          value={url}
          onChange={event => setUrl(event.target.value)}
          helperText="The address you open TaskMint at in a browser"
          required
          fullWidth
        />
        <TextField
          label="Username"
          autoComplete="username"
          value={username}
          onChange={event => setUsername(event.target.value)}
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
        <Box>
          <Button type="submit" variant="contained" disabled={busy}>
            {submitLabel}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

function OnTheServer({ connection }: { connection: ServerConnection }) {
  const { showSuccess, showWarning, showError } = useNotification();
  const [confirming, setConfirming] = useState<"upload" | "disconnect" | null>(null);

  const upload = async () => {
    try {
      const { records, restored, warnings } = await serverMode.upload();
      showSuccess(
        `Copied ${restored.sessionsRestored} session(s) and ${records} kind(s) of records to the server ` +
          `(${restored.sessionsAlreadyPresent} session(s) were there already).`,
      );
      warnings.forEach(warning => showWarning(warning));
    } catch (failure) {
      showError(sentence(failure));
      throw failure;
    }
  };

  const disconnect = async () => {
    try {
      const { signedOut } = await serverMode.disconnect();
      if (!signedOut) {
        showWarning(
          "The server couldn't be told, so it lists this computer's token under API tokens until you revoke it there.",
        );
      }
      await serverMode.restart();
    } catch (failure) {
      showError(sentence(failure));
      throw failure;
    }
  };

  return (
    <Stack spacing={2}>
      <Typography>
        Your data is on <strong>{connection.url}</strong>, signed in as <strong>{connection.username}</strong> from “
        {connection.deviceName}”.
      </Typography>
      {connection.status === "unreachable" && (
        <Alert severity="warning">
          TaskMint can't reach the server, so changes fail until it's back. It keeps trying. {connection.detail}
        </Alert>
      )}
      {connection.status === "signedOut" && (
        <>
          <Alert severity="error">
            This computer was signed out of the server. Sign in again to use it, or disconnect to use the data on this
            computer.
          </Alert>
          <SignInForm connection={connection} submitLabel="Sign in again" />
        </>
      )}
      <Stack direction="row" spacing={2}>
        <Button variant="outlined" onClick={() => setConfirming("upload")}>
          Copy this computer's data here
        </Button>
        <Button variant="outlined" color="error" onClick={() => setConfirming("disconnect")}>
          Disconnect
        </Button>
      </Stack>
      <ConfirmDialog
        open={confirming === "upload"}
        onClose={() => setConfirming(null)}
        onConfirm={upload}
        title="Copy this computer's data to the server?"
        message={
          "Sessions, work logs, tasks, notes and templates on this computer are added to the server's, and nothing " +
          "there is replaced. Timers still running in this computer's data are stopped as of now."
        }
        confirmLabel="Copy"
      />
      <ConfirmDialog
        open={confirming === "disconnect"}
        onClose={() => setConfirming(null)}
        onConfirm={disconnect}
        title="Disconnect from the server?"
        message={
          "TaskMint restarts with the data on this computer. The server keeps its data, and this computer is signed " +
          "out of it."
        }
        confirmLabel="Disconnect"
        severity="error"
      />
    </Stack>
  );
}
