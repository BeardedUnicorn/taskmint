/**
 * Where cloud sync stands, at the foot of the sidebar: up to date, sending,
 * needing attention, or signed out. It opens Settings → Cloud sync, where
 * signing in and out are. Shown only where this device syncs.
 */

import { ButtonBase, Tooltip, Typography } from '@mui/material';
import {
  CloudDone as SyncedIcon,
  CloudOff as SignedOutIcon,
  CloudSync as SyncingIcon,
  SyncProblem as AttentionIcon,
} from '@mui/icons-material';
import type { SvgIconComponent } from '@mui/icons-material';
import { syncsThisDevice, useCloudSync, type SyncView } from '../../cloud';
import { useNavigation } from '../../contexts/NavigationContext';
import { HOVER, TOUCH } from '../../theme/media';

type Tone = 'success.main' | 'text.secondary' | 'warning.main';

/** What the line says for a sync phase, with its icon and color. */
export function syncStatus({ phase }: Pick<SyncView, 'phase'>): { label: string; Icon: SvgIconComponent; tone: Tone } {
  switch (phase) {
    case 'synced':
      return { label: 'Synced', Icon: SyncedIcon, tone: 'success.main' };
    case 'syncing':
      return { label: 'Syncing…', Icon: SyncingIcon, tone: 'text.secondary' };
    case 'loading':
    case 'connecting':
      return { label: 'Connecting…', Icon: SyncingIcon, tone: 'text.secondary' };
    case 'signedOut':
      return { label: 'Not signed in', Icon: SignedOutIcon, tone: 'text.secondary' };
    default:
      // choose, otherAccount, cloudReset, error: something to answer or fix
      return { label: 'Sync needs attention', Icon: AttentionIcon, tone: 'warning.main' };
  }
}

export function SyncStatusLine({ collapsed }: { collapsed: boolean }) {
  const sync = useCloudSync();
  const { navigate } = useNavigation();
  if (!sync || !syncsThisDevice()) return null;

  const { label, Icon, tone } = syncStatus(sync.view);
  const name = `Cloud sync: ${label}`;
  return (
    <Tooltip title={collapsed ? name : ''} placement="right">
      <ButtonBase
        onClick={() => navigate('settings', { section: 'sync' })}
        aria-label={name}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 1,
          width: '100%',
          px: collapsed ? 0 : 1,
          py: 0.75,
          mb: 1,
          borderRadius: 1,
          color: tone,
          [HOVER]: { '&:hover': { bgcolor: 'action.hover' } },
          // Room for a finger
          [TOUCH]: { minHeight: 44 },
        }}
      >
        <Icon fontSize="small" />
        {!collapsed && (
          <Typography variant="caption" color="text.secondary" noWrap>
            {label}
          </Typography>
        )}
      </ButtonBase>
    </Tooltip>
  );
}
