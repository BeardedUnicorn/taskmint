/**
 * The sidebar's bell: a count of notifications that arrived while you weren't
 * looking (or that only went to the OS), and the recent ones in a popover.
 * Opening it marks them read; the ones that were new stay highlighted until
 * it closes.
 */

import { Fragment, useState, MouseEvent } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  List,
  ListItem,
  Popover,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  CheckCircleOutlined,
  ErrorOutlined,
  InfoOutlined,
  NotificationsNoneOutlined,
  NotificationsOutlined,
  WarningAmberOutlined,
} from '@mui/icons-material';
import { useNotificationState } from '../../contexts/NotificationContext';
import type { HistoryAction, HistoryEntry } from '../../notifications/history';
import type { Severity } from '../../notifications/types';

dayjs.extend(relativeTime);

const ICONS: Record<Severity, typeof InfoOutlined> = {
  success: CheckCircleOutlined,
  info: InfoOutlined,
  warning: WarningAmberOutlined,
  error: ErrorOutlined,
};

function HistoryItem({
  entry,
  isNew,
  onOpenPage,
}: {
  entry: HistoryEntry;
  isNew: boolean;
  onOpenPage: (action: HistoryAction) => void;
}) {
  const Icon = ICONS[entry.severity];
  return (
    <ListItem
      alignItems="flex-start"
      sx={{
        gap: 1.5,
        px: 2,
        py: 1.25,
        bgcolor: theme => (isNew ? alpha(theme.palette.primary.main, 0.08) : 'transparent'),
      }}
    >
      <Icon fontSize="small" sx={{ color: `${entry.severity}.main`, mt: '2px' }} aria-hidden />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {entry.title && (
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {entry.title}
          </Typography>
        )}
        <Typography
          variant="body2"
          color={entry.title ? 'text.secondary' : 'text.primary'}
          sx={{ overflowWrap: 'anywhere' }}
        >
          {entry.message}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="caption" color="text.secondary">
            {dayjs(entry.at).fromNow()}
            {entry.count > 1 ? ` · ×${entry.count}` : ''}
            {entry.delivery === 'desktop' ? ' · sent while you were away' : ''}
          </Typography>
          {entry.actions?.map(action => (
            <Button
              key={action.label}
              size="small"
              onClick={() => onOpenPage(action)}
              sx={{ minHeight: 24, py: 0, px: 0.75, fontSize: '0.75rem' }}
            >
              {action.label}
            </Button>
          ))}
        </Stack>
      </Box>
    </ListItem>
  );
}

export function NotificationBell({ collapsed = false }: { collapsed?: boolean }) {
  const { history, unread, markAllRead, clearHistory, runAction } = useNotificationState();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // Unread when the popover opened: highlighted while it stays open
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const open = (event: MouseEvent<HTMLElement>) => {
    setNewIds(new Set(history.filter(entry => !entry.read).map(entry => entry.id)));
    setAnchor(event.currentTarget);
    markAllRead();
  };
  const close = () => setAnchor(null);

  const openPage = (action: HistoryAction) => {
    runAction(action);
    close();
  };

  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';

  return (
    <>
      <Tooltip title="Notifications" placement={collapsed ? 'right' : 'bottom'}>
        <IconButton size="small" aria-label={label} aria-haspopup="dialog" onClick={open}>
          <Badge badgeContent={unread} max={9} color="error" overlap="circular">
            {unread > 0 ? <NotificationsOutlined /> : <NotificationsNoneOutlined />}
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: collapsed ? 'right' : 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 400, maxWidth: 'calc(100vw - 32px)', maxHeight: 520 } } }}
      >
        <Box role="dialog" aria-label="Recent notifications">
          <Stack direction="row" sx={{ alignItems: 'center', px: 2, py: 1.25 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
              Notifications
            </Typography>
            <Button size="small" onClick={clearHistory} disabled={history.length === 0}>
              Clear
            </Button>
          </Stack>
          <Divider />
          {history.length === 0 ? (
            <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
              <NotificationsNoneOutlined color="disabled" sx={{ fontSize: 36 }} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Nothing yet. Messages from the last two weeks show up here.
              </Typography>
            </Box>
          ) : (
            <List disablePadding sx={{ overflowY: 'auto', maxHeight: 460 }}>
              {history.map((entry, index) => (
                <Fragment key={entry.id}>
                  {index > 0 && <Divider component="li" />}
                  <HistoryItem entry={entry} isNew={newIds.has(entry.id)} onOpenPage={openPage} />
                </Fragment>
              ))}
            </List>
          )}
        </Box>
      </Popover>
    </>
  );
}
