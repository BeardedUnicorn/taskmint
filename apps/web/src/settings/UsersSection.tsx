import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
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
import GroupIcon from '@mui/icons-material/Group';
import { ConfirmDialog, SettingsSection, useNotification } from '@taskmint/client/ui';
import { ShownOnceDialog } from './CopyField';
import { problem } from '../server';
import { shortDate, type WebSession } from '../session';
import type { AdminUser, NewLink, Role } from '../types';

/**
 * Admins: every account, its role, disabling and enabling it, and
 * password-reset links (there's no email, so the admin passes them on).
 */
export function UsersSection({ session }: { session: WebSession }) {
  const { server, user: me } = session;
  const { showError, showSuccess } = useNotification();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [disabling, setDisabling] = useState<AdminUser | null>(null);
  const [resetLink, setResetLink] = useState<(NewLink & { username: string }) | null>(null);

  const load = useCallback(
    () =>
      server.request<AdminUser[]>('GET', '/admin/users').then(
        list => {
          setUsers(list);
          setLoadError(null);
        },
        error => setLoadError(problem(error))
      ),
    [server]
  );
  useEffect(() => {
    void load();
  }, [load]);

  const change = async (user: AdminUser, update: { role?: Role; disabled?: boolean }, done: string) => {
    try {
      await server.request('PATCH', `/admin/users/${user.id}`, update);
    } catch (error) {
      showError(problem(error));
      throw error;
    }
    showSuccess(done);
    void load();
  };

  const makeResetLink = async (user: AdminUser) => {
    try {
      setResetLink(await server.request<NewLink & { username: string }>('POST', `/admin/users/${user.id}/password-reset`));
    } catch (error) {
      showError(problem(error));
    }
  };

  return (
    <SettingsSection title="Users" icon={<GroupIcon color="primary" />}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Disabling an account signs it out everywhere and revokes its tokens. A reset link sets a new password; pass it
        on yourself.
      </Typography>
      {loadError && <Alert severity="error">{loadError}</Alert>}
      <List dense disablePadding aria-label="Users">
        {users?.map(user => (
          <ListItem key={user.id} divider sx={{ flexWrap: 'wrap', columnGap: 2, rowGap: 1 }}>
            <ListItemText
              primary={
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <span>{user.displayName || user.username}</span>
                  {user.displayName && (
                    <Typography variant="body2" color="text.secondary" component="span">
                      {user.username}
                    </Typography>
                  )}
                  {user.id === me.id && <Chip size="small" label="You" />}
                  {user.disabledAt && <Chip size="small" color="warning" label="Disabled" />}
                </Stack>
              }
              secondary={`Joined ${shortDate(user.createdAt)} · last seen ${shortDate(user.lastSeenAt)}`}
            />
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <TextField
                select
                size="small"
                label="Role"
                sx={{ minWidth: 110 }}
                value={user.role}
                onChange={event =>
                  void change(user, { role: event.target.value as Role }, `${user.username} is now a ${event.target.value}`).catch(
                    () => undefined
                  )
                }
              >
                <MenuItem value="user">User</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </TextField>
              <Button size="small" sx={{ whiteSpace: 'nowrap' }} onClick={() => makeResetLink(user)}>
                Reset link
              </Button>
              {user.disabledAt ? (
                <Button
                  size="small"
                  onClick={() => void change(user, { disabled: false }, `Enabled ${user.username}`).catch(() => undefined)}
                >
                  Enable
                </Button>
              ) : (
                <Button size="small" color="error" onClick={() => setDisabling(user)}>
                  Disable
                </Button>
              )}
            </Stack>
          </ListItem>
        ))}
      </List>

      <ConfirmDialog
        open={disabling !== null}
        onClose={() => setDisabling(null)}
        onConfirm={() => change(disabling!, { disabled: true }, `Disabled ${disabling!.username}`)}
        title={`Disable ${disabling?.username ?? ''}?`}
        message="They're signed out everywhere and their tokens are revoked. You can enable the account again later."
        confirmLabel="Disable"
        severity="error"
      />
      <ShownOnceDialog
        title={`Password reset for ${resetLink?.username ?? ''}`}
        label="Link"
        value={resetLink?.url ?? null}
        onClose={() => setResetLink(null)}
      >
        Send them this link. It works once, until {resetLink && new Date(resetLink.expiresAt).toLocaleString()}.
      </ShownOnceDialog>
    </SettingsSection>
  );
}
