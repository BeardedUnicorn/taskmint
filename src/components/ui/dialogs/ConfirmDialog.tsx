
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Alert,
} from '@mui/material';
import { ConfirmDialogProps } from '../../../types/form';

/**
 * Reusable confirmation dialog component
 * Provides consistent styling for delete confirmations and other destructive actions
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmColor,
  severity = 'warning',
  sx,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    onClose();
  };

  const getConfirmButtonColor = () => {
    // Use confirmColor prop if provided, otherwise fall back to severity-based logic
    if (confirmColor) {
      return confirmColor;
    }

    switch (severity) {
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      case 'info':
        return 'primary';
      default:
        return 'primary';
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      sx={sx}
    >
      <DialogTitle>{title}</DialogTitle>
      
      <DialogContent>
        <Alert severity={severity} sx={{ mb: 2 }}>
          <DialogContentText component="div">
            {message}
          </DialogContentText>
        </Alert>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleCancel} color="secondary">
          {cancelLabel}
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color={getConfirmButtonColor()}
          autoFocus
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
