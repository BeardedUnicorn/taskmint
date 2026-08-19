import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
} from '@mui/material';
import { FormDialogProps } from '../../../types/form';

/**
 * Reusable form dialog component with consistent styling and behavior
 * Provides a standardized wrapper for form dialogs throughout the app
 */
export function FormDialog({
  open,
  onClose,
  title,
  children,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  submitDisabled = false,
  maxWidth = 'sm',
  fullWidth = true,
  sx,
}: FormDialogProps) {
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (onSubmit) {
      onSubmit();
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={maxWidth}
      fullWidth={fullWidth}
      sx={sx}
    >
      {/* noValidate: dialogs do their own validation and render MUI helper
          text; native constraint bubbles would block submit before it runs. */}
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{title}</DialogTitle>
        
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            {children}
          </Box>
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleCancel} color="secondary">
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={submitDisabled}
          >
            {submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
