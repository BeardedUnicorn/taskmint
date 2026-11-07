/**
 * The command palette (⌘K): type to filter what the app can do, ↑/↓ to
 * pick, Enter to run, Esc to close. A combobox over a listbox, so a screen
 * reader follows the highlighted command.
 */

import { KeyboardEvent, useEffect, useId, useMemo, useState } from 'react';
import {
  Box,
  Dialog,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  ListSubheader,
  TextField,
  Typography,
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { Command, rankCommands } from './commands';
import { PALETTE_ATTRIBUTE } from '../../hooks/useKeyboardShortcuts';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const listId = useId();

  // Fresh each time it opens
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlighted(0);
    }
  }, [open]);

  const matches = useMemo(() => rankCommands(commands, query), [commands, query]);
  const active = matches[Math.min(highlighted, matches.length - 1)];
  const optionId = (command: Command) => `${listId}-${command.id}`;

  // Keep the highlighted command in view
  useEffect(() => {
    if (active) document.getElementById(`${listId}-${active.id}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    // Closed first, so a dialog the command opens isn't behind this one
    onClose();
    command.run();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted(index => (matches.length === 0 ? 0 : (Math.min(index, matches.length - 1) + 1) % matches.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted(index =>
        matches.length === 0 ? 0 : (Math.min(index, matches.length - 1) - 1 + matches.length) % matches.length
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(active);
    }
  };

  // Group headings only while browsing; a search is one ranked list
  const showGroups = query.trim() === '';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      {...{ [PALETTE_ATTRIBUTE]: '' }}
      // (On the paper: that's the element with role="dialog")
      slotProps={{
        paper: { 'aria-label': 'Command palette', sx: { position: 'fixed', top: '12vh', m: 0, maxHeight: '70vh' } },
      }}
    >
      <Box sx={{ p: 2, pb: 1 }}>
        <TextField
          autoFocus
          fullWidth
          placeholder="Type a command or a task…"
          value={query}
          onChange={event => {
            setQuery(event.target.value);
            setHighlighted(0);
          }}
          onKeyDown={handleKeyDown}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            },
            htmlInput: {
              role: 'combobox',
              'aria-label': 'Command',
              'aria-expanded': true,
              'aria-controls': listId,
              'aria-autocomplete': 'list',
              'aria-activedescendant': active ? optionId(active) : undefined,
            },
          }}
        />
      </Box>

      <List id={listId} role="listbox" aria-label="Commands" dense sx={{ overflowY: 'auto', pt: 0 }}>
        {matches.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ px: 3, py: 2 }}>
            Nothing matches “{query.trim()}”.
          </Typography>
        )}
        {matches.map((command, index) => (
          <Box component="li" key={command.id} role="presentation" sx={{ listStyle: 'none' }}>
            {showGroups && (index === 0 || matches[index - 1].group !== command.group) && (
              <ListSubheader
                component="div"
                role="presentation"
                sx={{ lineHeight: '32px', bgcolor: 'background.paper' }}
              >
                {command.group}
              </ListSubheader>
            )}
            <ListItemButton
              id={optionId(command)}
              role="option"
              aria-selected={command === active}
              selected={command === active}
              onMouseMove={() => setHighlighted(index)}
              onClick={() => run(command)}
              tabIndex={-1}
              sx={{ mx: 1, borderRadius: 1, minHeight: 40 }}
            >
              <ListItemText primary={command.label} />
              {command.hint && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 2, fontFamily: 'monospace' }}>
                  {command.hint}
                </Typography>
              )}
            </ListItemButton>
          </Box>
        ))}
      </List>
    </Dialog>
  );
}
