import { Box, Typography } from '@mui/material';
import { VIEWS, VIEW_LABELS } from '../../../navigation/views';
import { browserTakesShortcuts, modifierLabel, shiftModifierLabel } from '../../../hooks/useKeyboardShortcuts';

/** The app's keyboard shortcuts, for Settings → Appearance. */
export function KeyboardShortcutsList() {
  const mod = modifierLabel();
  const shift = shiftModifierLabel();
  const rows: Array<[string, string]> = [
    [`${mod}K`, 'Command palette: pages, actions, start or stop a timer'],
    [`${mod}1–${VIEWS.length}`, VIEWS.map(view => VIEW_LABELS[view]).join(', ')],
    // The browser keeps these for itself
    ...(browserTakesShortcuts()
      ? []
      : ([
          [`${mod}N`, 'New task'],
          [`${shift}N`, 'Start work'],
          [`${shift}P`, 'Pause or resume the timer'],
          [`${mod},`, 'Settings'],
        ] as Array<[string, string]>)),
  ];
  return (
    <Box
      component="dl"
      sx={{
        display: 'grid',
        gridTemplateColumns: 'max-content 1fr',
        columnGap: 2,
        rowGap: 1,
        alignItems: 'baseline',
        m: 0,
      }}
    >
      {rows.map(([keys, action]) => (
        <Box key={keys} sx={{ display: 'contents' }}>
          {/* Drawn as a key cap */}
          <Typography component="dt" variant="body2" sx={{ m: 0 }}>
            <Box
              component="kbd"
              sx={{
                display: 'inline-block',
                px: 0.75,
                py: 0.25,
                border: 1,
                borderColor: 'divider',
                borderBottomWidth: 2,
                borderRadius: 0.5,
                bgcolor: 'action.hover',
                fontFamily: 'inherit',
                fontSize: '0.8125rem',
                fontWeight: 600,
                lineHeight: 1.4,
                whiteSpace: 'nowrap',
              }}
            >
              {keys}
            </Box>
          </Typography>
          <Typography component="dd" variant="body2" color="text.secondary" sx={{ m: 0 }}>
            {action}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}
