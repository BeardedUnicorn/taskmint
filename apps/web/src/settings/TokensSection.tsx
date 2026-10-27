import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import KeyIcon from '@mui/icons-material/Key';
import { ConfirmDialog, SettingsSection, useNotification } from '@taskmint/client/ui';
import { ShownOnceDialog } from './CopyField';
import { problem } from '../server';
import { shortDate, type WebSession } from '../session';
import type { NewToken, TokenInfo, TokenScope } from '../types';

const SCOPES: Record<TokenScope, string> = {
  capture: 'Browser extension: sends captures only',
  full: 'Full access: everything but tokens',
};

/**
 * API tokens: for the browser extension (capture), for scripts (full), and
 * the ones desktop apps made signing in. A token's secret is shown once.
 */
export function TokensSection({ session }: { session: WebSession }) {
  const { server } = session;
  const { showError, showSuccess } = useNotification();
  const [tokens, setTokens] = useState<TokenInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<TokenScope>('capture');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<NewToken | null>(null);
  const [revoking, setRevoking] = useState<TokenInfo | null>(null);

  const load = useCallback(
    () =>
      server.request<TokenInfo[]>('GET', '/tokens').then(
        list => {
          setTokens(list);
          setLoadError(null);
        },
        error => setLoadError(problem(error))
      ),
    [server]
  );
  useEffect(() => {
    void load();
  }, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      setCreated(await server.request<NewToken>('POST', '/tokens', { name, scope }));
      setName('');
      void load();
    } catch (error) {
      showError(problem(error));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (token: TokenInfo) => {
    try {
      await server.request('DELETE', `/tokens/${token.id}`);
    } catch (error) {
      showError(problem(error));
      throw error;
    }
    showSuccess(`Revoked "${token.name}"`);
    void load();
  };

  return (
    <SettingsSection title="API tokens" icon={<KeyIcon color="primary" />}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        The TaskMint browser extension sends captures with a token; a desktop app signed in to this server has one
        too. Revoke a token you no longer use.
      </Typography>

      <Box component="form" onSubmit={create} noValidate sx={{ mb: 3 }}>
        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <TextField
            label="Name"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Chrome on my laptop"
            size="small"
            sx={{ flex: '1 1 180px' }}
          />
          <TextField
            select
            label="Access"
            value={scope}
            onChange={event => setScope(event.target.value as TokenScope)}
            size="small"
            sx={{ flex: '1 1 260px' }}
          >
            {(Object.keys(SCOPES) as TokenScope[]).map(option => (
              <MenuItem key={option} value={option}>
                {SCOPES[option]}
              </MenuItem>
            ))}
          </TextField>
          <Button type="submit" variant="contained" disabled={busy || !name.trim()} sx={{ whiteSpace: 'nowrap' }}>
            Create token
          </Button>
        </Stack>
      </Box>

      {loadError && <Alert severity="error">{loadError}</Alert>}
      {tokens?.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No tokens yet.
        </Typography>
      )}
      <List dense disablePadding aria-label="API tokens">
        {tokens?.map(token => (
          <ListItem
            key={token.id}
            divider
            secondaryAction={
              <Button color="error" size="small" onClick={() => setRevoking(token)}>
                Revoke
              </Button>
            }
          >
            <ListItemText
              primary={
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <span>{token.name}</span>
                  <Chip size="small" label={token.scope === 'full' ? 'Full access' : 'Captures'} />
                  {token.kind === 'device' && <Chip size="small" variant="outlined" label="Desktop app" />}
                </Stack>
              }
              secondary={`${token.prefix}… · created ${shortDate(token.createdAt)} · last used ${shortDate(token.lastUsedAt)}`}
            />
          </ListItem>
        ))}
      </List>

      <ShownOnceDialog
        title={`Token "${created?.name ?? ''}" created`}
        label="Token"
        value={created?.token ?? null}
        onClose={() => setCreated(null)}
      >
        Copy it now: it isn't shown again. Paste it into the extension's options to send captures to this server.
      </ShownOnceDialog>
      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={() => revoke(revoking!)}
        title={`Revoke "${revoking?.name ?? ''}"?`}
        message="Whatever uses it stops working at once."
        confirmLabel="Revoke"
        confirmColor="error"
        severity="error"
      />
    </SettingsSection>
  );
}
