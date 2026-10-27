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
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { SettingsSection, useNotification } from '@taskmint/client/ui';
import { ShownOnceDialog } from './CopyField';
import { problem } from '../server';
import { shortDate, type WebSession } from '../session';
import type { Invite, NewLink, Role } from '../types';

const STATUS_COLORS = { pending: 'success', used: 'default', revoked: 'default', expired: 'warning' } as const;

/** Admins: invite links, each for one new account. */
export function InvitesSection({ session }: { session: WebSession }) {
  const { server } = session;
  const { showError, showSuccess } = useNotification();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('user');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<NewLink | null>(null);

  const load = useCallback(
    () =>
      server.request<Invite[]>('GET', '/admin/invites').then(
        list => {
          setInvites(list);
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
      setLink(await server.request<NewLink>('POST', '/admin/invites', { role, note }));
      setNote('');
      void load();
    } catch (error) {
      showError(problem(error));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (invite: Invite) => {
    try {
      await server.request('DELETE', `/admin/invites/${invite.id}`);
    } catch (error) {
      showError(problem(error));
      return;
    }
    showSuccess('Invite revoked');
    void load();
  };

  return (
    <SettingsSection title="Invites" icon={<PersonAddIcon color="primary" />}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Accounts are by invitation. Make a link, send it to the person, and it creates their account once.
      </Typography>
      <Box component="form" onSubmit={create} noValidate sx={{ mb: 3 }}>
        <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <TextField
            select
            size="small"
            label="Role"
            value={role}
            onChange={event => setRole(event.target.value as Role)}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="user">User</MenuItem>
            <MenuItem value="admin">Admin</MenuItem>
          </TextField>
          <TextField
            size="small"
            label="Note"
            value={note}
            onChange={event => setNote(event.target.value)}
            placeholder="Who it's for"
            sx={{ flex: '1 1 180px' }}
          />
          <Button type="submit" variant="contained" disabled={busy} sx={{ whiteSpace: 'nowrap' }}>
            Create invite
          </Button>
        </Stack>
      </Box>
      {loadError && <Alert severity="error">{loadError}</Alert>}
      {invites?.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          No invites yet.
        </Typography>
      )}
      <List dense disablePadding aria-label="Invites">
        {invites?.map(invite => (
          <ListItem
            key={invite.id}
            divider
            secondaryAction={
              invite.status === 'pending' && (
                <Button size="small" color="error" onClick={() => revoke(invite)}>
                  Revoke
                </Button>
              )
            }
          >
            <ListItemText
              primary={
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <span>{invite.note || (invite.role === 'admin' ? 'Admin invite' : 'Invite')}</span>
                  <Chip size="small" color={STATUS_COLORS[invite.status]} label={invite.status} />
                  {invite.role === 'admin' && <Chip size="small" variant="outlined" label="Admin" />}
                </Stack>
              }
              secondary={
                invite.usedBy
                  ? `Used by ${invite.usedBy} on ${shortDate(invite.usedAt)}`
                  : `Made ${shortDate(invite.createdAt)} · expires ${shortDate(invite.expiresAt)}`
              }
            />
          </ListItem>
        ))}
      </List>
      <ShownOnceDialog title="Invite created" label="Link" value={link?.url ?? null} onClose={() => setLink(null)}>
        Send this link to the person you're inviting. It works once, until{' '}
        {link && new Date(link.expiresAt).toLocaleString()}.
      </ShownOnceDialog>
    </SettingsSection>
  );
}
