/**
 * A table's rows as a phone shows them: one under another, each with what
 * it is on the left (wrapping, never cut), its figure on the right, the rest
 * in a line under them, and its actions at the end. Desktops keep their
 * tables; a phone's narrow screen would scroll those sideways and cut their
 * last columns off.
 */

import { ReactNode, useState } from 'react';
import { Box, ButtonBase, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import { MoreVert as MoreIcon } from '@mui/icons-material';
import { focusColor } from '../../../theme/components';

const FIGURE = { fontFamily: '"Roboto Mono", monospace', fontWeight: 600, whiteSpace: 'nowrap' } as const;

export function StackedList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box role="list" aria-label={label}>
      {children}
    </Box>
  );
}

export interface StackedRowProps {
  /** What the row is: a task, a date. */
  title: ReactNode;
  /** Its figure, right-aligned. */
  figure?: ReactNode;
  /** The rest of the row, under the title: times, statuses, chips. */
  details?: ReactNode;
  /** A mark before the title (a lock for a held release). */
  leading?: ReactNode;
  /** A mark after the figure that does nothing itself (a scheduled alarm). */
  trailing?: ReactNode;
  /** Buttons at the end of the row. A row with actions isn't a button itself. */
  actions?: ReactNode;
  /** The whole row opens something; `label` names it for screen readers. */
  onClick?: () => void;
  label?: string;
  selected?: boolean;
}

export function StackedRow({
  title,
  figure,
  details,
  leading,
  trailing,
  actions,
  onClick,
  label,
  selected = false,
}: StackedRowProps) {
  const body = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, px: 0.5, width: '100%' }}>
      {leading}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
          <Typography
            variant="body2"
            component="div"
            sx={{ flex: 1, minWidth: 0, fontWeight: 500, overflowWrap: 'anywhere' }}
          >
            {title}
          </Typography>
          {figure !== undefined && (
            <Typography variant="body2" component="div" sx={FIGURE}>
              {figure}
            </Typography>
          )}
        </Box>
        {details && (
          <Box
            sx={{
              mt: 0.5,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '4px 8px',
              typography: 'caption',
              color: 'text.secondary',
            }}
          >
            {details}
          </Box>
        )}
      </Box>
      {trailing}
      {actions}
    </Box>
  );
  return (
    <Box
      role="listitem"
      sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: selected ? 'action.selected' : undefined }}
    >
      {onClick ? (
        <ButtonBase
          onClick={onClick}
          aria-label={label}
          sx={theme => ({
            display: 'block',
            width: '100%',
            textAlign: 'left',
            '&:focus-visible': { outline: `2px solid ${focusColor(theme.palette.mode)}`, outlineOffset: -2 },
          })}
        >
          {body}
        </ButtonBase>
      ) : (
        body
      )}
    </Box>
  );
}

export interface RowAction {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** Destructive: shown in red. */
  danger?: boolean;
}

/** A row's actions behind one ⋮ button (`label` names the row: "Actions for …"). */
export function RowMenu({ label, actions }: { label: string; actions: RowAction[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <IconButton aria-label={label} aria-haspopup="menu" onClick={event => setAnchor(event.currentTarget)}>
        <MoreIcon />
      </IconButton>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {actions.map(action => (
          <MenuItem
            key={action.label}
            onClick={() => {
              setAnchor(null);
              action.onClick();
            }}
            sx={action.danger ? { color: 'error.main' } : undefined}
          >
            <ListItemIcon sx={action.danger ? { color: 'inherit' } : undefined}>{action.icon}</ListItemIcon>
            <ListItemText>{action.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
