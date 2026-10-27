import type { FocusEvent, ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useNotification } from '@taskmint/client/ui';

/** A value to hand on (a token, a link), with a button that copies it. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const { showSuccess, showError } = useNotification();
  const copy = () =>
    navigator.clipboard.writeText(value).then(
      () => showSuccess('Copied'),
      () => showError("Couldn't copy it: select it and copy it yourself.")
    );
  return (
    <TextField
      label={label}
      value={value}
      fullWidth
      slotProps={{
        input: {
          readOnly: true,
          sx: { fontFamily: 'monospace' },
          endAdornment: (
            <InputAdornment position="end">
              <Tooltip title="Copy">
                <IconButton aria-label={`Copy ${label.toLowerCase()}`} onClick={copy} edge="end">
                  <ContentCopyIcon />
                </IconButton>
              </Tooltip>
            </InputAdornment>
          ),
        },
        htmlInput: { onFocus: (event: FocusEvent<HTMLInputElement>) => event.target.select() },
      }}
    />
  );
}

/** A secret or link shown once, to copy before closing. */
export function ShownOnceDialog({
  title,
  label,
  value,
  children,
  onClose,
}: {
  title: string;
  label: string;
  value: string | null;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <Dialog open={value !== null} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <DialogContentText>{children}</DialogContentText>
          {value !== null && <CopyField label={label} value={value} />}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
